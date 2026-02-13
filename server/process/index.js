/**
 * Process management for Claude PTY and run-render child processes.
 */
import { spawn } from "child_process";
import treeKill from "tree-kill";
import pty from "node-pty";
import fs from "fs";
import path from "path";
import { WORKSPACE_CWD, CLAUDE_OUTPUT_LOG, DEFAULT_PERMISSION_MODE } from "../config/index.js";
import { killProcessOnPort, stripAnsi } from "../utils/index.js";
import { getChatSystemPrompt } from "../prompts/index.js";

/** Track all child processes so we can kill them when the server exits (e.g. terminal closed, Ctrl+C). */
export const globalClaudePtyProcesses = new Set();
export const globalSpawnChildren = new Set();

/** Kill a Claude PTY process and its entire process tree (so subprocesses started by Claude are cleaned up). */
export function killClaudePtyProcess(ptyProcess) {
  if (!ptyProcess) return;
  const pid = ptyProcess.pid;
  try {
    ptyProcess.kill();
  } catch (_) {}
  if (pid) {
    try {
      treeKill(pid, "SIGKILL", () => {});
    } catch (_) {}
  }
}

export function shutdown(signal) {
  const sig = signal || "SIGTERM";
  for (const p of globalClaudePtyProcesses) {
    killClaudePtyProcess(p);
  }
  globalClaudePtyProcesses.clear();
  for (const c of globalSpawnChildren) {
    try {
      if (process.platform !== "win32" && c.pid) {
        try {
          process.kill(-c.pid, "SIGTERM");
        } catch (_) {}
      }
      c.kill();
    } catch (_) {}
  }
  globalSpawnChildren.clear();
  process.exit(0);
}

function emitError(socket, message) {
  socket.emit("output", `\r\n\x1b[31m[Error] ${message}\x1b[0m\r\n`);
}

export function spawnClaude(socket, prompt, permissionMode, allowedTools, useContinue, appendSystemPrompt) {
  const args = [
    "--output-format", "stream-json",
    "--verbose",
    ...(appendSystemPrompt ? ["--append-system-prompt", appendSystemPrompt] : []),
    ...(useContinue ? ["-c"] : []),
    ...(permissionMode ? ["--permission-mode", permissionMode] : []),
    ...(Array.isArray(allowedTools) && allowedTools.length > 0
      ? ["--allowedTools", ...allowedTools]
      : []),
    "-p", prompt,
  ];
  try {
    const ptyProcess = pty.spawn("claude", args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: WORKSPACE_CWD,
      env: { ...process.env, TERM: "xterm-256color" },
    });
    globalClaudePtyProcesses.add(ptyProcess);

    let logStream = null;
    try {
      const logDir = path.dirname(CLAUDE_OUTPUT_LOG);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      logStream = fs.createWriteStream(CLAUDE_OUTPUT_LOG, { flags: "a" });
      const header = `\n--- Claude session started ${new Date().toISOString()} ---\n`;
      logStream.write(header);
      if (appendSystemPrompt) {
        logStream.write(`[system-prompt] append (used):\n${appendSystemPrompt}\n--- end system prompt ---\n`);
      }
    } catch (err) {
      console.warn("[claude-log] Failed to create log file:", err.message);
    }

    ptyProcess.onData((data) => {
      socket.emit("output", data);
      const text = stripAnsi(data);
      if (text) process.stdout.write(text);
      if (logStream?.writable) logStream.write(data);
    });

    socket.emit("claude-started", {
      permissionMode: permissionMode || null,
      allowedTools: allowedTools || [],
      useContinue: !!useContinue,
    });

    ptyProcess.onExit(({ exitCode }) => {
      globalClaudePtyProcesses.delete(ptyProcess);
      if (logStream?.writable) {
        logStream.write(`\n--- Session ended (exit ${exitCode}) ${new Date().toISOString()} ---\n`);
        logStream.end();
      }
      socket.emit("exit", { exitCode });
    });

    return ptyProcess;
  } catch (err) {
    const msg = err.code === "ENOENT"
      ? "claude not found. Install Claude Code CLI and ensure it is in PATH."
      : (err.message || "Failed to start Claude.");
    emitError(socket, msg);
    return null;
  }
}

/**
 * Creates a Claude process manager for a socket connection.
 */
export function createClaudeProcessManager(socket, { hasCompletedFirstRunRef }) {
  let ptyProcess = null;

  function claudeProcessRunning() {
    return ptyProcess !== null;
  }

  function handleSubmitPrompt(payload) {
    console.log("[submit-prompt] full input:", JSON.stringify(payload, null, 2));
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) {
      emitError(socket, "Prompt cannot be empty.");
      return;
    }
    const replaceRunning = !!payload?.replaceRunning;
    if (replaceRunning && ptyProcess) {
      globalClaudePtyProcesses.delete(ptyProcess);
      killClaudePtyProcess(ptyProcess);
      ptyProcess = null;
      hasCompletedFirstRunRef.value = true;
      socket.emit("exit", { exitCode: 0 });
    }
    console.log("[submit-prompt] chat input (user prompt):", prompt);
    const permissionMode =
      typeof payload?.permissionMode === "string" && payload.permissionMode.trim()
        ? payload.permissionMode.trim()
        : DEFAULT_PERMISSION_MODE || null;
    const allowedTools = Array.isArray(payload?.allowedTools)
      ? payload.allowedTools.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    const useContinue = hasCompletedFirstRunRef.value;

    const appendSystemPrompt = getChatSystemPrompt();
    console.log("[system-prompt] used (append):", appendSystemPrompt ? `${appendSystemPrompt.slice(0, 80)}...` : "(none)");
    if (appendSystemPrompt) {
      console.log("[system-prompt] full content:\n", appendSystemPrompt);
    }
    ptyProcess = spawnClaude(socket, prompt, permissionMode || null, allowedTools, useContinue, appendSystemPrompt);
  }

  function handleInput(data) {
    console.log("[input] chat input (user reply):", typeof data === "string" ? data.replace(/\r$/, "") : JSON.stringify(data));
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  function handleResize({ cols, rows }) {
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  }

  function handleTerminate() {
    if (ptyProcess) {
      globalClaudePtyProcesses.delete(ptyProcess);
      killClaudePtyProcess(ptyProcess);
      ptyProcess = null;
    }
    socket.emit("exit", { exitCode: 0 });
  }

  function handleDebug(payload) {
    console.log("[claude-debug]", JSON.stringify(payload, null, 2));
  }

  function cleanup() {
    if (ptyProcess) {
      globalClaudePtyProcesses.delete(ptyProcess);
      killClaudePtyProcess(ptyProcess);
      ptyProcess = null;
    }
  }

  return {
    claudeProcessRunning,
    handleSubmitPrompt,
    handleInput,
    handleResize,
    handleTerminate,
    handleDebug,
    cleanup,
  };
}
