/**
 * Process management for AI provider PTY (Claude/Gemini) and run-render child processes.
 */
import treeKill from "tree-kill";
import pty from "node-pty";
import fs from "fs";
import path from "path";
import {
  getWorkspaceCwd,
  getProviderLogPath,
  DEFAULT_PERMISSION_MODE,
  DEFAULT_GEMINI_APPROVAL_MODE,
  DEFAULT_PROVIDER,
} from "../config/index.js";
import { stripAnsi } from "../utils/index.js";
import { getChatSystemPrompt } from "../prompts/index.js";

import { claudeConfig } from "./claude.js";
import { geminiConfig } from "./gemini.js";

const PROVIDER_CONFIG = {
  claude: claudeConfig,
  gemini: geminiConfig,
};

/** Track all AI PTY processes so we can kill them when the server exits. */
export const globalPtyProcesses = new Set();
/** @deprecated Use globalPtyProcesses */
export const globalClaudePtyProcesses = globalPtyProcesses;
export const globalSpawnChildren = new Set();

/** Kill an AI PTY process and its entire process tree. */
export function killPtyProcess(ptyProcess) {
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

/** @deprecated Use killPtyProcess */
export function killClaudePtyProcess(ptyProcess) {
  return killPtyProcess(ptyProcess);
}

export function shutdown(signal) {
  const sig = signal || "SIGTERM";
  for (const p of globalPtyProcesses) {
    killPtyProcess(p);
  }
  globalPtyProcesses.clear();
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

export function spawnProvider(socket, provider, prompt, options) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    emitError(socket, `Unknown provider: ${provider}. Use "claude" or "gemini".`);
    return null;
  }
  const args = config.buildArgs(prompt, options);
  const commandStr = [config.binary, ...args].join(" ");
  console.log(`[${provider}] command:`, commandStr);

  try {
    const ptyProcess = pty.spawn(config.binary, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: getWorkspaceCwd(),
      env: { ...process.env, TERM: "xterm-256color" },
    });
    globalPtyProcesses.add(ptyProcess);

    let logStream = null;
    try {
      const logPath = getProviderLogPath(provider);
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      logStream = fs.createWriteStream(logPath, { flags: "a" });
      const header = `\n--- ${provider} session started ${new Date().toISOString()} ---\n`;
      logStream.write(header);
      logStream.write(`[command] ${commandStr}\n`);
      if (options.appendSystemPrompt) {
        logStream.write(
          `[system-prompt] append (used):\n${options.appendSystemPrompt}\n--- end system prompt ---\n`
        );
      }
    } catch (err) {
      console.warn("[ai-log] Failed to create log file:", err.message);
    }

    ptyProcess.onData((data) => {
      socket.emit("output", data);
      const text = stripAnsi(data);
      if (text) process.stdout.write(text);
      if (logStream?.writable) logStream.write(data);
    });

    socket.emit("claude-started", {
      provider,
      permissionMode: options.permissionMode || null,
      allowedTools: options.allowedTools || [],
      useContinue: !!options.useContinue,
      approvalMode: options.approvalMode || null,
    });

    ptyProcess.onExit(({ exitCode }) => {
      globalPtyProcesses.delete(ptyProcess);
      if (logStream?.writable) {
        logStream.write(
          `\n--- Session ended (exit ${exitCode}) ${new Date().toISOString()} ---\n`
        );
        logStream.end();
      }
      // Mark first run as completed so next submit-prompt uses --resume (Gemini) / -c (Claude)
      if (exitCode === 0 && options.hasCompletedFirstRunRef) {
        options.hasCompletedFirstRunRef.value = true;
      }
      socket.emit("exit", { exitCode });
    });

    return ptyProcess;
  } catch (err) {
    const msg =
      err.code === "ENOENT" ? config.notFoundMessage : (err.message || `Failed to start ${provider}.`);
    emitError(socket, msg);
    return null;
  }
}

/**
 * Creates an AI process manager for a socket connection (Claude or Gemini).
 */
export function createProcessManager(socket, { hasCompletedFirstRunRef }) {
  let ptyProcess = null;

  function processRunning() {
    return ptyProcess !== null;
  }

  function handleSubmitPrompt(payload) {
    console.log("[submit-prompt] full input:", JSON.stringify(payload, null, 2));
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const replaceRunning = !!payload?.replaceRunning;

    // Retry/continue in current session: empty prompt + replaceRunning means send continue signal to existing PTY
    if (replaceRunning && ptyProcess && prompt === "") {
      ptyProcess.write("\n");
      console.log("[submit-prompt] continue signal sent to existing session");
      return;
    }

    if (!prompt) {
      emitError(socket, "Prompt cannot be empty.");
      return;
    }

    if (replaceRunning && ptyProcess) {
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
      hasCompletedFirstRunRef.value = true;
      socket.emit("exit", { exitCode: 0 });
    }
    const provider =
      payload?.provider === "gemini" ? "gemini" : payload?.provider === "claude" ? "claude" : DEFAULT_PROVIDER;
    console.log("[submit-prompt] chat input (user prompt):", prompt, "provider:", provider);
    const permissionMode =
      typeof payload?.permissionMode === "string" && payload.permissionMode.trim()
        ? payload.permissionMode.trim()
        : DEFAULT_PERMISSION_MODE || null;
    const allowedTools = Array.isArray(payload?.allowedTools)
      ? payload.allowedTools.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    // When user sends a new message while previous session is still running, kill it so we can spawn with --resume and the new prompt
    if (ptyProcess && !replaceRunning && prompt) {
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
      hasCompletedFirstRunRef.value = true;
      socket.emit("exit", { exitCode: 0 });
    }
    const useContinue = hasCompletedFirstRunRef.value;
    const approvalMode =
      typeof payload?.approvalMode === "string" && payload.approvalMode.trim()
        ? payload.approvalMode.trim()
        : DEFAULT_GEMINI_APPROVAL_MODE;

    const defaultModel = provider === "claude" ? "sonnet" : "gemini-2.5-flash";
    const model =
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : defaultModel;

    let appendSystemPrompt = null;
    if (provider === "claude") {
      appendSystemPrompt = getChatSystemPrompt();
      console.log(
        "[system-prompt] used (append):",
        appendSystemPrompt ? `${appendSystemPrompt.slice(0, 80)}...` : "(none)"
      );
      if (appendSystemPrompt) {
        console.log("[system-prompt] full content:\n", appendSystemPrompt);
      }
    }

    const options = {
      model,
      permissionMode: permissionMode || null,
      allowedTools,
      useContinue,
      appendSystemPrompt: appendSystemPrompt || undefined,
      approvalMode: provider === "gemini" ? approvalMode : undefined,
      hasCompletedFirstRunRef,
    };

    // When continuing (second+ message), kill existing PTY so Gemini can persist session as "latest" before we spawn with --resume
    if (useContinue && ptyProcess) {
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
    }

    ptyProcess = spawnProvider(socket, provider, prompt, options);
  }

  function handleInput(data) {
    console.log(
      "[input] chat input (user reply):",
      typeof data === "string" ? data.replace(/\r$/, "") : JSON.stringify(data)
    );
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
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
    }
    socket.emit("exit", { exitCode: 0 });
  }

  function handleDebug(payload) {
    console.log("[claude-debug]", JSON.stringify(payload, null, 2));
  }

  function cleanup() {
    if (ptyProcess) {
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
    }
  }

  return {
    processRunning,
    claudeProcessRunning: processRunning,
    handleSubmitPrompt,
    handleInput,
    handleResize,
    handleTerminate,
    handleDebug,
    cleanup,
  };
}
