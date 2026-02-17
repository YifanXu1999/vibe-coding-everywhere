/**
 * Process management for AI provider PTY (Claude/Gemini) and run-render child processes.
 */
import crypto from "crypto";
import treeKill from "tree-kill";
import pty from "node-pty";
import fs from "fs";
import path from "path";
import {
  getWorkspaceCwd,
  getProviderLogPath,
  getLlmCliIoTurnPaths,
  DEFAULT_PERMISSION_MODE,
  DEFAULT_GEMINI_APPROVAL_MODE,
  DEFAULT_PROVIDER,
  CODEX_PROFILE,
} from "../config/index.js";
import { killProcessOnPort, stripAnsi } from "../utils/index.js";
import { getChatSystemPrompt } from "../prompts/index.js";

import { claudeConfig } from "./claude.js";
import { geminiConfig } from "./gemini.js";
import { createCodexAppServerSession } from "./codexAppServerSession.js";

const PTY_PROVIDER_CONFIG = {
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

/**
 * Format command arguments as a single readable/copyable line.
 * Multi-line values (e.g. system prompts) are escaped instead of breaking the command.
 */
function formatArgForLog(arg) {
  const s = String(arg ?? "");
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
  if (!s || /[\s"'`$\\]/.test(s)) return `"${escaped}"`;
  return escaped;
}

function formatCommandForLog(binary, args) {
  return [binary, ...args.map(formatArgForLog)].join(" ");
}

function parsePort(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

function extractPortsFromCommand(command) {
  const ports = new Set();
  if (!command) return ports;

  const patterns = [
    /\bpython(?:3)?\s+-m\s+http\.server\s+(\d{1,5})\b/gi,
    /(?:^|\s)(?:--port|-p)\s*=?\s*(\d{1,5})(?=\s|$)/gi,
    /(?:^|\s)(?:PORT|VITE_PORT|WEBPACK_DEV_SERVER_PORT|NG_PORT)\s*=\s*(\d{1,5})(?=\s|$)/gi,
    /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})\b/gi,
    /https?:\/\/[^\s:/]+:(\d{1,5})\b/gi,
  ];

  for (const re of patterns) {
    for (const m of command.matchAll(re)) {
      const p = parsePort(m[1]);
      if (p != null) ports.add(p);
    }
  }

  return ports;
}

function isLikelyServerStartCommand(command) {
  const s = String(command || "").toLowerCase();
  if (!s) return false;
  return (
    /\bpython(?:3)?\s+-m\s+http\.server\b/.test(s) ||
    /\bvite\b/.test(s) ||
    /\bnext\s+dev\b/.test(s) ||
    /\bng\s+serve\b/.test(s) ||
    /\breact-scripts\s+start\b/.test(s) ||
    /\bwebpack-dev-server\b/.test(s) ||
    /\bexpo\s+start\b/.test(s) ||
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b/.test(s)
  );
}

function inferDefaultServerPort(command) {
  const s = String(command || "").toLowerCase();
  if (!s) return null;
  if (/\bnext\s+dev\b/.test(s)) return 3000;
  if (/\bng\s+serve\b/.test(s)) return 4200;
  if (/\breact-scripts\s+start\b/.test(s)) return 3000;
  if (/\bvite\b/.test(s)) return 5173;
  if (/\bwebpack-dev-server\b/.test(s)) return 8080;
  if (/\bexpo\s+start\b/.test(s)) return 8081;
  return null;
}

/** Format current time as yyyy-MM-dd_HH-mm-ss (24-hour) for log directory names. */
function formatSessionLogTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function spawnProvider(socket, provider, prompt, options) {
  const config = PTY_PROVIDER_CONFIG[provider];
  if (!config) {
    emitError(socket, `Unknown PTY provider: ${provider}. Use "claude" or "gemini".`);
    return null;
  }
  const args = config.buildArgs(prompt, options);
  const commandStr = formatCommandForLog(config.binary, args);
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
    let ioInputStream = null;
    let ioOutputStream = null;
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
      if (options.systemPrompt) {
        logStream.write(
          `[system-prompt] override (used):\n${options.systemPrompt}\n--- end system prompt ---\n`
        );
      }
      // llm-cli-input-output: {timestamp}/{provider}-{sessionLogTimestamp}/{turnId}/input.log, output.log
      const sessionId = options.sessionLogTimestamp ?? options.conversationSessionId ?? options.sessionId ?? "unknown";
      const turnId = options.turnId ?? 1;
      const { inputPath, outputPath } = getLlmCliIoTurnPaths(provider, sessionId, turnId);
      ioInputStream = fs.createWriteStream(inputPath, { flags: "a" });
      ioInputStream.write(`${commandStr}\n`);
      ioInputStream.end();
      ioOutputStream = fs.createWriteStream(outputPath, { flags: "a" });
    } catch (err) {
      console.warn("[ai-log] Failed to create log file:", err.message);
    }

    let codexLineBuffer = "";
    let providerDebugLineBuffer = "";
    const backgroundHttpServerPorts = new Set();
    ptyProcess.onData((data) => {
      socket.emit("output", data);
      const text = stripAnsi(data);
      if (text) process.stdout.write(text);
      if (logStream?.writable) logStream.write(data);
      if (ioOutputStream?.writable) ioOutputStream.write(data);

      providerDebugLineBuffer += data;
      const providerDebugLines = providerDebugLineBuffer.split("\n");
      providerDebugLineBuffer = providerDebugLines.pop() ?? "";
      for (const rawLine of providerDebugLines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const content = parsed?.message?.content;
          if (!Array.isArray(content)) continue;
          for (const item of content) {
            if (item?.type !== "tool_use" || item?.name !== "Bash") continue;
            const toolInput = item?.input && typeof item.input === "object" ? item.input : {};
            const toolCommand = typeof toolInput.command === "string" ? toolInput.command : "";
            const runInBackground = toolInput.run_in_background === true;
            const hasNohup = /\bnohup\b/.test(toolCommand);
            const hasDisown = /\bdisown\b/.test(toolCommand);
            const hasSingleAmpersand = /(^|[^&])&(?!&)/.test(toolCommand);
            const isBackgroundized = runInBackground || hasSingleAmpersand || hasNohup || hasDisown;
            if (!isBackgroundized || !isLikelyServerStartCommand(toolCommand)) continue;

            const ports = extractPortsFromCommand(toolCommand);
            if (ports.size === 0) {
              const inferred = inferDefaultServerPort(toolCommand);
              if (inferred != null) ports.add(inferred);
            }

            for (const portNum of ports) {
              backgroundHttpServerPorts.add(portNum);
            }
          }
        } catch (_) {
          // ignore non-JSON lines
        }
      }

      if (provider === "codex" && options.session_management) {
        codexLineBuffer += data;
        const lines = codexLineBuffer.split("\n");
        codexLineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed?.type === "thread.started" && typeof parsed.thread_id === "string") {
              options.session_management.session_id = parsed.thread_id;
              console.log("[codex] thread_id captured:", parsed.thread_id);
            }
            const codexErrorMsg =
              parsed?.type === "error"
                ? parsed.message
                : parsed?.type === "turn.failed"
                  ? parsed.error?.message
                  : null;
            if (
              typeof codexErrorMsg === "string" &&
              codexErrorMsg.includes("missing rollout path for thread")
            ) {
              options.session_management.session_id = null;
              console.log("[codex] cleared session_id after error:", codexErrorMsg.slice(0, 80));
            }
          } catch (_) {
            // ignore malformed JSON lines
          }
        }
      }
    });

    socket.emit("claude-started", {
      provider,
      session_id: options.sessionId ?? options.conversationSessionId ?? null,
      permissionMode: options.permissionMode || null,
      allowedTools: options.allowedTools || [],
      useContinue: !!options.useContinue,
      approvalMode: options.approvalMode || null,
    });

    ptyProcess.onExit(({ exitCode }) => {
      globalPtyProcesses.delete(ptyProcess);
      if (backgroundHttpServerPorts.size > 0) {
        for (const port of backgroundHttpServerPorts) {
          killProcessOnPort(port);
        }
      }
      if (logStream?.writable) {
        logStream.write(
          `\n--- Session ended (exit ${exitCode}) ${new Date().toISOString()} ---\n`
        );
        logStream.end();
      }
      if (ioOutputStream?.writable) {
        ioOutputStream.end();
      }
      // Mark first run as completed so next submit-prompt uses --resume (Gemini) / --resume <sessionId> (Claude)
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
 * Creates an AI process manager for a socket connection (Claude, Gemini, Codex).
 */
export function createProcessManager(socket, { hasCompletedFirstRunRef, session_management }) {
  let ptyProcess = null;
  let turnCounter = 0;
  const codexSession = createCodexAppServerSession({
    socket,
    hasCompletedFirstRunRef,
    sessionManagement: session_management,
    globalSpawnChildren,
    getWorkspaceCwd,
    getChatSystemPrompt,
    getLlmCliIoTurnPaths,
    formatCommandForLog,
  });

  function processRunning() {
    return ptyProcess !== null || codexSession.isTurnRunning();
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
      payload?.provider === "codex"
        ? "codex"
        : payload?.provider === "gemini"
          ? "gemini"
          : payload?.provider === "claude"
            ? "claude"
            : DEFAULT_PROVIDER;
    if (provider !== "codex" && codexSession.hasProcess()) {
      codexSession.close();
    }
    console.log("[submit-prompt] chat input (user prompt):", prompt, "provider:", provider);
    const permissionMode =
      typeof payload?.permissionMode === "string" && payload.permissionMode.trim()
        ? payload.permissionMode.trim()
        : DEFAULT_PERMISSION_MODE || null;
    const allowedTools = Array.isArray(payload?.allowedTools)
      ? payload.allowedTools.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    const defaultModel =
      provider === "claude" ? "sonnet" : provider === "codex" ? "gpt-5-codex" : "gemini-2.5-flash";
    const model =
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : defaultModel;
    // When user sends a new message while previous session is still running, kill it so we can spawn with --resume and the new prompt
    if (ptyProcess && !replaceRunning && prompt) {
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
      hasCompletedFirstRunRef.value = true;
      socket.emit("exit", { exitCode: 0 });
    }
    // Swapping provider or model starts a new session (clear session_id, next run is "first")
    if (
      session_management &&
      (session_management.provider !== provider || session_management.model !== model)
    ) {
      session_management.session_id = null;
      session_management.session_log_timestamp = null;
      session_management.provider = provider;
      session_management.model = model;
      hasCompletedFirstRunRef.value = false;
    }

    const useContinue = hasCompletedFirstRunRef.value;
    // Claude: no session_id before first conversation; assign when establishing first run, then use --resume
    // Codex: session_id comes from thread.started (thread_id) and is persisted in session_management
    let sessionId = undefined;
    if (provider === "claude" && session_management) {
      if (session_management.session_id) {
        sessionId = session_management.session_id;
      } else {
        session_management.session_id = crypto.randomUUID();
        sessionId = session_management.session_id;
      }
    }
    if (provider === "codex" && session_management?.session_id) {
      sessionId = session_management.session_id;
    }

    const approvalMode =
      typeof payload?.approvalMode === "string" && payload.approvalMode.trim()
        ? payload.approvalMode.trim()
        : DEFAULT_GEMINI_APPROVAL_MODE;

    let systemPrompt = null;
    if (provider === "claude") {
      systemPrompt = getChatSystemPrompt();
      console.log(
        "[system-prompt] used (override):",
        systemPrompt ? `${systemPrompt.slice(0, 80)}...` : "(none)"
      );
      if (systemPrompt) {
        console.log("[system-prompt] full content:\n", systemPrompt);
      }
    }
    turnCounter += 1;
    if (session_management && !session_management.session_log_timestamp) {
      session_management.session_log_timestamp = formatSessionLogTimestamp();
    }
    const conversationSessionId = socket.id ?? "unknown";

    const askForApproval =
      typeof payload?.askForApproval === "string" && payload.askForApproval.trim()
        ? payload.askForApproval.trim()
        : undefined;
    const fullAuto = payload?.fullAuto === true;
    const yolo = payload?.yolo === true;
    const skipGitRepoCheck = payload?.skipGitRepoCheck === true;

    const options = {
      model,
      permissionMode: permissionMode || null,
      allowedTools,
      useContinue,
      sessionId,
      systemPrompt: systemPrompt || undefined,
      approvalMode: provider === "gemini" ? approvalMode : undefined,
      askForApproval: provider === "codex" ? askForApproval : undefined,
      fullAuto: provider === "codex" ? fullAuto : undefined,
      yolo: provider === "codex" ? yolo : undefined,
      skipGitRepoCheck: provider === "codex" ? skipGitRepoCheck : undefined,
      codexProfile: provider === "codex" && CODEX_PROFILE ? CODEX_PROFILE : undefined,
      hasCompletedFirstRunRef,
      sessionLogTimestamp: session_management?.session_log_timestamp ?? undefined,
      conversationSessionId,
      turnId: turnCounter,
    };

    if (provider === "codex") {
      codexSession.startTurn({ prompt, options }).catch((err) => {
        emitError(socket, err?.message || "Failed to start Codex app-server turn.");
        socket.emit("exit", { exitCode: 1 });
      });
      return;
    }

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
    if (codexSession.handleInput(data)) return;
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  function handleResize({ cols, rows }) {
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  }

  function handleTerminate(payload) {
    const resetSession = !!payload?.resetSession;
    if (resetSession && session_management) {
      hasCompletedFirstRunRef.value = false;
      session_management.session_id = null;
      session_management.session_log_timestamp = null;
    }
    if (ptyProcess) {
      globalPtyProcesses.delete(ptyProcess);
      killPtyProcess(ptyProcess);
      ptyProcess = null;
    }
    if (codexSession.hasProcess()) codexSession.close();
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
    if (codexSession.hasProcess()) codexSession.close();
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
