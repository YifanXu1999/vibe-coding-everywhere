/**
 * Process management for AI provider PTY (Claude/Gemini) and run-render child processes.
 */
import crypto from "crypto";
import { spawn } from "child_process";
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
  projectRoot,
} from "../config/index.js";
import { killProcessOnPort, stripAnsi } from "../utils/index.js";
import { getChatSystemPrompt } from "../prompts/index.js";

import { claudeConfig } from "./claude.js";
import { geminiConfig } from "./gemini.js";
import { codexConfig } from "./codex.js";

const PROVIDER_CONFIG = {
  claude: claudeConfig,
  gemini: geminiConfig,
  codex: codexConfig,
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

function parseAskQuestionAnswersFromInput(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const top = JSON.parse(raw);
    const content = top?.message?.content;
    if (!Array.isArray(content) || content.length === 0) return null;
    const first = content[0];
    const inner = typeof first?.content === "string" ? first.content : null;
    if (!inner) return null;
    const parsed = JSON.parse(inner);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function decideApprovalFromAnswers(answers, fallbackRaw) {
  const selected = Array.isArray(answers)
    ? answers.flatMap((a) => (Array.isArray(a?.selected) ? a.selected : []))
    : [];
  const normalized = selected.map((s) => String(s).trim().toLowerCase());
  const hasAccept = normalized.some((s) => /approve|accept|allow|run/.test(s));
  const hasDeny = normalized.some((s) => /deny|decline|reject|cancel|block/.test(s));
  if (hasAccept && !hasDeny) return true;
  if (hasDeny && !hasAccept) return false;
  const raw = typeof fallbackRaw === "string" ? fallbackRaw.trim().toLowerCase() : "";
  if (["y", "yes", "approve", "accept", "allow", "run"].includes(raw)) return true;
  if (["n", "no", "deny", "decline", "reject", "cancel", "block"].includes(raw)) return false;
  return false;
}

function toCodexAskUserQuestionPayload(reqId, method, params) {
  if (method === "item/commandExecution/requestApproval") {
    const command = typeof params?.command === "string" ? params.command : "(unknown command)";
    const reason = typeof params?.reason === "string" && params.reason.trim() ? `\nReason: ${params.reason}` : "";
    return {
      tool_name: "AskUserQuestion",
      tool_use_id: String(reqId),
      tool_input: {
        questions: [
          {
            header: "Command approval",
            question: `Allow Codex to run this command?\n${command}${reason}`,
            options: [
              { label: "Approve", description: "Run this command." },
              { label: "Deny", description: "Do not run this command." },
            ],
            multiSelect: false,
          },
        ],
      },
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      tool_name: "AskUserQuestion",
      tool_use_id: String(reqId),
      tool_input: {
        questions: [
          {
            header: "File change approval",
            question: "Allow Codex to apply the proposed file changes?",
            options: [
              { label: "Approve", description: "Apply these changes." },
              { label: "Deny", description: "Do not apply these changes." },
            ],
            multiSelect: false,
          },
        ],
      },
    };
  }
  if (method === "item/tool/call") {
    const toolName = typeof params?.tool === "string" && params.tool.trim() ? params.tool.trim() : "unknown-tool";
    const argumentsPreview =
      params && typeof params === "object" && Object.prototype.hasOwnProperty.call(params, "arguments")
        ? JSON.stringify(params.arguments, null, 2)
        : "";
    const question = argumentsPreview
      ? `Allow Codex to call tool "${toolName}" with these arguments?\n${argumentsPreview}`
      : `Allow Codex to call tool "${toolName}"?`;
    return {
      tool_name: "AskUserQuestion",
      tool_use_id: String(reqId),
      tool_input: {
        questions: [
          {
            header: "Tool call approval",
            question,
            options: [
              { label: "Approve", description: "Allow this tool call." },
              { label: "Deny", description: "Do not execute this tool call." },
            ],
            multiSelect: false,
          },
        ],
      },
    };
  }
  if (method === "item/tool/requestUserInput" && Array.isArray(params?.questions)) {
    return {
      tool_name: "AskUserQuestion",
      tool_use_id: String(reqId),
      tool_input: {
        questions: params.questions.map((q) => ({
          header: typeof q?.header === "string" ? q.header : "",
          question: typeof q?.question === "string" ? q.question : "",
          options: Array.isArray(q?.options)
            ? q.options.map((o) => ({
                label: String(o?.label ?? ""),
                description: o?.description != null ? String(o.description) : undefined,
              }))
            : [],
          multiSelect: false,
        })),
      },
    };
  }
  return null;
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
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    emitError(socket, `Unknown provider: ${provider}. Use "claude", "gemini", or "codex".`);
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
 * Creates an AI process manager for a socket connection (Claude or Gemini).
 */
export function createProcessManager(socket, { hasCompletedFirstRunRef, session_management }) {
  let ptyProcess = null;
  let turnCounter = 0;
  let codexAppProcess = null;
  let codexStdoutBuffer = "";
  let codexRpcIdCounter = 0;
  const codexPendingRequests = new Map();
  let codexReadyPromise = null;
  let codexThreadId = null;
  let codexTurnRunning = false;
  let codexPendingServerRequest = null;
  /** Full `codex app-server ...` command we actually run. Set in ensureCodexAppServer for accurate input.log. */
  let codexAppServerCommandStr = null;
  /** Stream for llm-cli-input-output output.log (current Codex turn). Set at turn start, closed on turn/completed or process close. */
  let codexIoOutputStream = null;

  function emitCodexEvent(event) {
    const line = JSON.stringify(event) + "\n";
    socket.emit("output", line);
    if (codexIoOutputStream?.writable) codexIoOutputStream.write(line);
  }

  function clearCodexPendingRequests(errorMessage) {
    for (const { reject } of codexPendingRequests.values()) {
      reject(new Error(errorMessage));
    }
    codexPendingRequests.clear();
  }

  function closeCodexAppProcess() {
    if (codexIoOutputStream?.writable) {
      try {
        codexIoOutputStream.end();
      } catch (_) {}
      codexIoOutputStream = null;
    }
    codexAppServerCommandStr = null;
    if (!codexAppProcess) return;
    globalSpawnChildren.delete(codexAppProcess);
    try {
      codexAppProcess.kill();
    } catch (_) {}
    codexAppProcess = null;
    codexReadyPromise = null;
    codexStdoutBuffer = "";
    codexThreadId = null;
    codexTurnRunning = false;
    codexPendingServerRequest = null;
    clearCodexPendingRequests("codex app-server closed");
  }

  function codexApprovalPolicy(opts) {
    if (opts.yolo === true) return "never";
    if (opts.fullAuto === true) return "on-request";
    if (typeof opts.askForApproval === "string" && opts.askForApproval.trim()) return opts.askForApproval.trim();
    return "on-request";
  }

  function codexThreadSandboxMode(opts) {
    if (opts.yolo === true) return "danger-full-access";
    if (opts.fullAuto === true) return "workspace-write";
    return null;
  }

  function parseCodexAppItem(item) {
    if (!item || typeof item !== "object") return null;
    const type = String(item.type ?? "");
    if (type === "agentMessage") {
      return { type: "agent_message", text: String(item.text ?? "") };
    }
    if (type === "commandExecution") {
      return {
        type: "command_execution",
        command: typeof item.command === "string" ? item.command : "",
        status: typeof item.status === "string" ? item.status : undefined,
        exit_code: typeof item.exitCode === "number" ? item.exitCode : undefined,
      };
    }
    if (type === "fileChange" && Array.isArray(item.changes)) {
      const changes = item.changes.map((ch) => ({
        path: typeof ch?.path === "string" ? ch.path : "",
        kind: typeof ch?.kind === "string" ? ch.kind : "change",
      }));
      return { type: "file_change", changes };
    }
    return null;
  }

  function handleCodexAppServerMessage(parsed) {
    if (!parsed || typeof parsed !== "object") return;
    const method = typeof parsed.method === "string" ? parsed.method : "";
    const hasId = parsed.id !== undefined && parsed.id !== null;

    // Server -> client request (requires response by id)
    if (method && hasId && parsed.params && !Object.prototype.hasOwnProperty.call(parsed, "result")) {
      const reqIdRaw = parsed.id;
      const reqId = String(reqIdRaw);
      const askPayload = toCodexAskUserQuestionPayload(reqId, method, parsed.params);
      if (askPayload) {
        codexPendingServerRequest = { id: reqId, idRaw: reqIdRaw, method, params: parsed.params };
        console.log("[codex] emitting AskUserQuestion for", method);
        const line = JSON.stringify(askPayload) + "\n";
        socket.emit("output", line);
        if (codexIoOutputStream?.writable) codexIoOutputStream.write(line);
      } else {
        // Unknown request type: decline by default so turn can continue safely.
        try {
          codexAppProcess?.stdin?.write(
            JSON.stringify({ id: reqIdRaw, result: { decision: "decline" } }) + "\n"
          );
        } catch (_) {}
      }
      return;
    }

    // Response to our request
    if (hasId && (Object.prototype.hasOwnProperty.call(parsed, "result") || Object.prototype.hasOwnProperty.call(parsed, "error"))) {
      const reqId = String(parsed.id);
      const pending = codexPendingRequests.get(reqId);
      if (!pending) return;
      codexPendingRequests.delete(reqId);
      if (parsed.error) pending.reject(new Error(parsed.error?.message || "codex app-server request failed"));
      else pending.resolve(parsed.result);
      return;
    }

    // Notifications
    if (!method) return;
    if (method === "thread/started") {
      const threadId = parsed?.params?.thread?.id;
      if (typeof threadId === "string" && threadId) {
        codexThreadId = threadId;
        if (session_management) session_management.session_id = threadId;
        emitCodexEvent({ type: "thread.started", thread_id: threadId });
      }
      return;
    }
    if (method === "turn/started") {
      codexTurnRunning = true;
      emitCodexEvent({ type: "turn.started" });
      return;
    }
    if (method === "turn/completed") {
      const status = parsed?.params?.turn?.status;
      codexTurnRunning = false;
      hasCompletedFirstRunRef.value = true;
      if (codexIoOutputStream?.writable) {
        try {
          codexIoOutputStream.end();
        } catch (_) {}
        codexIoOutputStream = null;
      }
      if (status === "errored" || status === "failed") {
        emitCodexEvent({ type: "turn.failed", error: { message: parsed?.params?.turn?.error?.message ?? "Turn failed." } });
        socket.emit("exit", { exitCode: 1 });
      } else {
        emitCodexEvent({ type: "turn.completed" });
        socket.emit("exit", { exitCode: 0 });
      }
      return;
    }
    if (method === "item/agentMessage/delta") {
      const delta = parsed?.params?.delta;
      if (typeof delta === "string" && delta) {
        emitCodexEvent({ type: "item.updated", item: { type: "agent_message", text: delta } });
      }
      return;
    }
    if (method === "item/started" || method === "item/completed") {
      const legacyItem = parseCodexAppItem(parsed?.params?.item);
      if (!legacyItem) return;
      emitCodexEvent({
        type: method === "item/started" ? "item.started" : "item.completed",
        item: legacyItem,
      });
      return;
    }
    if (method === "error") {
      const msg = parsed?.params?.message ?? parsed?.error?.message ?? "Error.";
      emitCodexEvent({ type: "error", message: String(msg) });
      return;
    }
  }

  function codexSendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!codexAppProcess?.stdin?.writable) {
        reject(new Error("codex app-server stdin is not writable"));
        return;
      }
      const id = String(++codexRpcIdCounter);
      codexPendingRequests.set(id, { resolve, reject });
      try {
        codexAppProcess.stdin.write(JSON.stringify({ id, method, params }) + "\n");
      } catch (err) {
        codexPendingRequests.delete(id);
        reject(err);
      }
    });
  }

  async function ensureCodexAppServer(options) {
    if (codexReadyPromise) return codexReadyPromise;

    const args = ["app-server"];
    if (options.codexProfile) args.push("--profile", options.codexProfile);
    if (options.modelInstructionsFile) {
      const arg = options.modelInstructionsFile.includes(" ")
        ? `model_instructions_file="${options.modelInstructionsFile.replace(/"/g, '\\"')}"`
        : `model_instructions_file=${options.modelInstructionsFile}`;
      args.push("--config", arg);
    }
    if (options.skipGitRepoCheck === true) args.push("--config", "skip_git_repo_check=true");
    const commandStr = formatCommandForLog("codex", args);
    codexAppServerCommandStr = commandStr;
    console.log("[codex] command:", commandStr);

    const child = spawn("codex", args, {
      cwd: getWorkspaceCwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    codexAppProcess = child;
    globalSpawnChildren.add(child);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk ?? "");
      codexStdoutBuffer += text;
      const lines = codexStdoutBuffer.split("\n");
      codexStdoutBuffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const jsonStart = line.indexOf("{");
        const candidate = jsonStart >= 0 ? line.slice(jsonStart) : line;
        try {
          const parsed = JSON.parse(candidate);
          handleCodexAppServerMessage(parsed);
        } catch (_) {
          const out = line + "\n";
          socket.emit("output", out);
          if (codexIoOutputStream?.writable) codexIoOutputStream.write(out);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk ?? "");
      if (text) socket.emit("output", text);
    });

    child.on("exit", (code) => {
      globalSpawnChildren.delete(child);
      if (codexAppProcess === child) codexAppProcess = null;
      codexReadyPromise = null;
      codexTurnRunning = false;
      codexPendingServerRequest = null;
      clearCodexPendingRequests(`codex app-server exited (${code ?? 0})`);
      socket.emit("exit", { exitCode: Number.isInteger(code) ? code : 0 });
    });

    codexReadyPromise = codexSendRequest("initialize", {
      clientInfo: {
        name: "vibe-coding-everywhere",
        title: "vibe-coding-everywhere",
        version: "1.0.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    return codexReadyPromise;
  }

  function processRunning() {
    return ptyProcess !== null || codexTurnRunning;
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
    if (provider !== "codex" && codexAppProcess) {
      closeCodexAppProcess();
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
    // Codex app-server: inject system prompt via thread/start baseInstructions (no profile file needed).
    const codexModelInstructionsFile = null;

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
      modelInstructionsFile: provider === "codex" ? codexModelInstructionsFile || undefined : undefined,
      hasCompletedFirstRunRef,
      session_management: provider === "codex" ? session_management : undefined,
      sessionLogTimestamp: session_management?.session_log_timestamp ?? undefined,
      conversationSessionId,
      turnId: turnCounter,
    };

    if (provider === "codex") {
      const approvalPolicy = codexApprovalPolicy(options);
      const sandboxMode = codexThreadSandboxMode(options);
      const useContinueForEvent = !!hasCompletedFirstRunRef.value;
      const startCodexTurn = async () => {
        await ensureCodexAppServer(options);

        const shouldStartNewThread =
          !session_management?.session_id ||
          !codexThreadId ||
          codexThreadId !== session_management.session_id;
        if (shouldStartNewThread) {
          const baseInstructions = getChatSystemPrompt() || null;
          if (baseInstructions) {
            console.log("[codex] injecting baseInstructions (length):", baseInstructions.length);
          }
          const threadResp = await codexSendRequest("thread/start", {
            model: options.model ?? null,
            modelProvider: null,
            cwd: getWorkspaceCwd(),
            approvalPolicy,
            sandbox: sandboxMode,
            config: null,
            baseInstructions,
            developerInstructions: null,
            personality: null,
            ephemeral: null,
            dynamicTools: null,
            mockExperimentalField: null,
            experimentalRawEvents: false,
          });
          const threadId = threadResp?.thread?.id;
          if (typeof threadId === "string" && threadId) {
            codexThreadId = threadId;
            if (session_management) session_management.session_id = threadId;
            emitCodexEvent({ type: "thread.started", thread_id: threadId });
          }
        }

        if (!codexThreadId) {
          throw new Error("Failed to establish Codex thread.");
        }

        socket.emit("claude-started", {
          provider: "codex",
          session_id: codexThreadId,
          permissionMode: null,
          allowedTools: [],
          useContinue: useContinueForEvent,
          approvalMode: null,
        });

        // llm-cli-input-output: log actual command (codex app-server) + turn input (prompt)
        try {
          const sessionId =
            options.sessionLogTimestamp ??
            options.conversationSessionId ??
            options.sessionId ??
            "unknown";
          const turnId = options.turnId ?? 1;
          const { inputPath, outputPath } = getLlmCliIoTurnPaths("codex", sessionId, turnId);
          const ioInputStream = fs.createWriteStream(inputPath, { flags: "a" });
          const fullCommand = codexAppServerCommandStr ?? "codex app-server";
          ioInputStream.write(`${fullCommand}\n`);
          ioInputStream.write(`${prompt}\n`);
          ioInputStream.end();
          if (codexIoOutputStream?.writable) {
            try {
              codexIoOutputStream.end();
            } catch (_) {}
          }
          codexIoOutputStream = fs.createWriteStream(outputPath, { flags: "a" });
        } catch (err) {
          console.warn("[llm-cli-io] Failed to create Codex turn log files:", err?.message);
        }

        await codexSendRequest("turn/start", {
          threadId: codexThreadId,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          cwd: getWorkspaceCwd(),
          approvalPolicy,
          sandboxPolicy: null,
          model: options.model ?? null,
          effort: null,
          summary: null,
          personality: null,
          outputSchema: null,
          collaborationMode: null,
        });
      };

      startCodexTurn().catch((err) => {
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
    if (codexAppProcess && codexPendingServerRequest) {
      const answers = parseAskQuestionAnswersFromInput(typeof data === "string" ? data : JSON.stringify(data));
      const approved = decideApprovalFromAnswers(answers, typeof data === "string" ? data : "");
      const pending = codexPendingServerRequest;
      codexPendingServerRequest = null;

      if (pending.method === "item/commandExecution/requestApproval") {
        const result = { decision: approved ? "accept" : "decline" };
        codexAppProcess.stdin.write(JSON.stringify({ id: pending.idRaw, result }) + "\n");
        return;
      }
      if (pending.method === "item/fileChange/requestApproval") {
        const result = { decision: approved ? "accept" : "decline" };
        codexAppProcess.stdin.write(JSON.stringify({ id: pending.idRaw, result }) + "\n");
        return;
      }
      if (pending.method === "item/tool/requestUserInput") {
        const questions = Array.isArray(pending.params?.questions) ? pending.params.questions : [];
        const answerList = Array.isArray(answers) ? answers : [];
        const answerMap = {};
        for (let i = 0; i < questions.length; i += 1) {
          const q = questions[i];
          const qid = typeof q?.id === "string" ? q.id : null;
          if (!qid) continue;
          const selected = Array.isArray(answerList[i]?.selected)
            ? answerList[i].selected.map((s) => String(s))
            : [];
          answerMap[qid] = { answers: selected };
        }
        codexAppProcess.stdin.write(JSON.stringify({ id: pending.idRaw, result: { answers: answerMap } }) + "\n");
        return;
      }
      if (pending.method === "item/tool/call") {
        const result = approved
          ? {
              success: false,
              contentItems: [
                {
                  type: "inputText",
                  text: "Tool call approved, but this mobile client does not implement dynamic tool execution for item/tool/call yet.",
                },
              ],
            }
          : {
              success: false,
              contentItems: [{ type: "inputText", text: "Tool call denied by user." }],
            };
        codexAppProcess.stdin.write(JSON.stringify({ id: pending.idRaw, result }) + "\n");
        return;
      }
    }
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
    if (codexAppProcess) {
      closeCodexAppProcess();
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
    if (codexAppProcess) {
      closeCodexAppProcess();
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
