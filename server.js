import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import pty from "node-pty";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

/** Kill any process listening on the given port (e.g. leftover from Claude verification). No-op if port invalid or none bound. */
function killProcessOnPort(port) {
  const p = parseInt(port, 10);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return;
  try {
    const pidList = execSync(`lsof -ti :${p}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (pidList) {
      execSync(`kill -9 ${pidList.split(/\s+/).join(" ")}`, { stdio: "ignore" });
    }
  } catch (_) {
    // No process on port or lsof/kill not available
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

/** Resolve workspace directory from CLI or env. Defaults to server directory. */
function getWorkspaceCwd() {
  const args = process.argv.slice(2);
  let fromCli = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workspace" && args[i + 1]) {
      fromCli = args[i + 1];
      break;
    }
    if (!args[i].startsWith("-")) {
      fromCli = args[i];
      break;
    }
  }
  const raw = fromCli ?? process.env.WORKSPACE ?? process.env.WORKSPACE_CWD ?? path.join(__dirname, "workspace");
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) {
    console.warn(`[workspace] Path does not exist: ${resolved}. Using server directory.`);
    return __dirname;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    console.warn(`[workspace] Not a directory: ${resolved}. Using server directory.`);
    return __dirname;
  }
  return resolved;
}

const WORKSPACE_CWD = getWorkspaceCwd();
const SIDEBAR_REFRESH_INTERVAL_MS = parseInt(process.env.SIDEBAR_REFRESH_INTERVAL_MS || "3000", 10) || 3000;
/** Log directory: env CLAUDE_OUTPUT_LOG, or <project-root>/logs (same dir as server.js). Timestamped filename at startup. */
const CLAUDE_LOG_DIR = process.env.CLAUDE_OUTPUT_LOG
  ? path.resolve(process.env.CLAUDE_OUTPUT_LOG)
  : path.join(__dirname, "logs");
function getClaudeLogPath() {
  let dir = path.join(__dirname, "logs");
  try {
    const stat = fs.statSync(CLAUDE_LOG_DIR);
    dir = stat.isDirectory() ? CLAUDE_LOG_DIR : path.dirname(CLAUDE_LOG_DIR);
  } catch {
    dir = path.isAbsolute(CLAUDE_LOG_DIR) ? path.dirname(CLAUDE_LOG_DIR) : path.join(__dirname, "logs");
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(dir, `claude-output-${ts}.log`);
}
/** Path to write Claude output log. One file per server run, with startup timestamp. */
const CLAUDE_OUTPUT_LOG = getClaudeLogPath();
// Default permission mode when client does not send one (e.g. bypassPermissions = allow all for testing)
const DEFAULT_PERMISSION_MODE = process.env.DEFAULT_PERMISSION_MODE || "bypassPermissions";

/** When set (e.g. 1 or true), use mock Claude: replay a log file instead of spawning the real CLI. */
const USE_MOCK_CLAUDE = /^(1|true|yes)$/i.test(process.env.MOCK_CLAUDE || process.env.USE_MOCK_CLAUDE || "");

/** Directory containing sequence log fixtures (apps/mobile/__tests__/sequences). */
function getMockSequencesDir() {
  return path.join(WORKSPACE_CWD, "apps", "mobile", "__tests__", "sequences");
}

/** List available sequence filenames (without .log) for mock replay. */
function getMockSequencesList() {
  const dir = getMockSequencesDir();
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".log"))
      .map((f) => f.replace(/\.log$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/** Resolve log path from sequence name (filename without .log). */
function resolveSequencePath(sequence) {
  if (!sequence || typeof sequence !== "string") return null;
  const base = sequence.replace(/\.log$/, "");
  const full = path.join(getMockSequencesDir(), base + ".log");
  return fs.existsSync(full) ? full : null;
}

/** Path to log file to replay in mock mode. Supports MOCK_CLAUDE_LOG, MOCK_CLAUDE_SEQUENCE, or defaults. */
function getMockClaudeLogPath(sequenceFromPayload) {
  const envPath = process.env.MOCK_CLAUDE_LOG || process.env.MOCK_CLAUDE_OUTPUT_LOG;
  if (envPath) return path.resolve(envPath);
  const envSeq = process.env.MOCK_CLAUDE_SEQUENCE;
  const seq = sequenceFromPayload || (envSeq && String(envSeq).trim()) || null;
  if (seq) {
    const resolved = resolveSequencePath(seq);
    if (resolved) return resolved;
  }
  const sequencesDir = getMockSequencesDir();
  if (fs.existsSync(sequencesDir)) {
    const defaultSeq = resolveSequencePath("ask-two-questions-purpose-style");
    if (defaultSeq) return defaultSeq;
  }
  const inWorkspaceDir = path.join(WORKSPACE_CWD, "workspace", "claude-output.log");
  if (fs.existsSync(inWorkspaceDir)) return inWorkspaceDir;
  const inCwd = path.join(WORKSPACE_CWD, "claude-output.log");
  if (fs.existsSync(inCwd)) return inCwd;
  return path.join(WORKSPACE_CWD, "workspace", "mock-claude-output.log");
}

const PAGE_RENDER_SYSTEM_PROMPT = `
## Page-render preview rule

When the task produces browser-viewable content (HTML, static site, dev server):
- Use a random port if the user does not specify one.
- Test the command(s) in a fresh terminal at workspace root (up to 3 attempts). Record logs.
- **Decide from the test result only:** Verified = command(s) ran with no errors. Not verified = "permission denied", "access denied", "EACCES", or any failure in the logs.
- **After verifying:** If the command starts a long-running server (e.g. http.server, dev server), terminate that test process (e.g. Ctrl+C) so the port is free. The user will run the same command again in the app; if the test process is left running, the app will get "Address already in use".
- **Output exactly one format.** When not verified, you must NOT output "Run the following command for render" or "URL for preview" — those lines are only for the verified case.

**If verified** (output only these two lines, no other text):
Run the following command for render: "<command(s)>"
URL for preview: "<url_to_render>"

**If not verified** (output only this line, no other text):
Need permission for the following commands: "<command(s)>"

<command(s)> = full, copy-pastable command(s) from workspace root to serve the page. <url_to_render> = URL to view after running.
`
const ANSI_REGEX =
  /\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-_]|\x1B.|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function stripAnsi(str) {
  if (typeof str !== "string") return "";
  return str.replace(ANSI_REGEX, "");
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".idea", ".vscode", "dist", "build", "out",
  ".cache", "coverage", ".nyc_output", ".expo"
]);

function buildWorkspaceTree(dirPath, basePath = "") {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name === "Thumbs.db") continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      try {
        const children = buildWorkspaceTree(fullPath, relPath);
        items.push({ name: entry.name, path: relPath, type: "folder", children });
      } catch (_) {
        items.push({ name: entry.name, path: relPath, type: "folder", children: [] });
      }
    } else {
      items.push({ name: entry.name, path: relPath, type: "file" });
    }
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return items;
}

const app = express();
const httpServer = createServer(app);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    const ts = new Date().toISOString();
    console.log(`[API] ${ts} ${req.method} ${req.path}`, req.query && Object.keys(req.query).length ? req.query : "");
    res.on("finish", () => {
      console.log(`[API] ${ts} ${req.method} ${req.path} -> ${res.statusCode}`);
    });
  }
  next();
});

app.get("/api/config", (_, res) => {
  res.json({
    sidebarRefreshIntervalMs: SIDEBAR_REFRESH_INTERVAL_MS,
    /** When true, server is in mock Claude mode; client may show sequence picker and call /api/mock-sequences. */
    useMockClaude: !!USE_MOCK_CLAUDE,
  });
});

app.get("/api/mock-sequences", (_, res) => {
  try {
    const list = getMockSequencesList();
    res.json({ sequences: list });
  } catch (err) {
    res.status(500).json({ sequences: [] });
  }
});

app.get("/api/workspace-path", (_, res) => {
  res.json({ path: WORKSPACE_CWD });
});

app.get("/api/workspace-tree", (_, res) => {
  try {
    const tree = buildWorkspaceTree(WORKSPACE_CWD);
    res.json({ root: path.basename(WORKSPACE_CWD), tree });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to read workspace" });
  }
});

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);
const MAX_TEXT_FILE_BYTES = 512 * 1024; // 500 KB - prevents huge files like package-lock.json from freezing the viewer

/** Serve raw workspace file for preview (HTML, etc.) so Preview works without running http.server. */
app.get("/api/preview-raw", (req, res) => {
  const relPath = req.query.path;
  if (typeof relPath !== "string" || !relPath.trim()) {
    return res.status(400).send("Missing or invalid path");
  }
  try {
    const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
    const fullPath = path.join(WORKSPACE_CWD, normalized);
    if (!fullPath.startsWith(WORKSPACE_CWD)) {
      return res.status(403).send("Path outside workspace");
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return res.status(400).send("Not a file");
    const ext = path.extname(normalized).toLowerCase().replace(/^\./, "");
    const mime = ext === "html" || ext === "htm" ? "text/html" : ext === "css" ? "text/css" : ext === "js" ? "application/javascript" : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.sendFile(fullPath);
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).send("File not found");
    res.status(500).send(err.message || "Failed to serve file");
  }
});

/** Serve workspace files at root path (e.g. /abc.html) so URLs like http://host:PORT/abc.html work for preview. */
function serveWorkspaceFile(req, res, next) {
  const rawPath = (req.path || "/").replace(/^\//, "") || "index.html";
  const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
  const fullPath = path.join(WORKSPACE_CWD, normalized);
  if (!fullPath.startsWith(WORKSPACE_CWD)) return next();
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return next();
    const ext = path.extname(normalized).toLowerCase().replace(/^\./, "");
    const mime = ext === "html" || ext === "htm" ? "text/html" : ext === "css" ? "text/css" : ext === "js" ? "application/javascript" : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.sendFile(fullPath);
  } catch (err) {
    if (err.code === "ENOENT") return next();
    res.status(500).send(err.message || "Failed to serve file");
  }
}
// Catch-all for non-API paths so /abc.html and /subdir/index.html work (must be after all /api/* routes)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  serveWorkspaceFile(req, res, next);
});

app.get("/api/workspace-file", (req, res) => {
  const relPath = req.query.path;
  if (typeof relPath !== "string" || !relPath.trim()) {
    return res.status(400).json({ error: "Missing or invalid path" });
  }
  try {
    const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(WORKSPACE_CWD, normalized);
    if (!fullPath.startsWith(WORKSPACE_CWD)) {
      return res.status(403).json({ error: "Path outside workspace" });
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: "Not a file" });
    }
    const ext = path.extname(normalized).toLowerCase().replace(/^\./, "");
    const isImage = IMAGE_EXT.has(ext);
    if (isImage) {
      const buffer = fs.readFileSync(fullPath);
      const content = buffer.toString("base64");
      res.json({ path: normalized, content, isImage: true });
    } else {
      if (stat.size > MAX_TEXT_FILE_BYTES) {
        return res.status(413).json({
          error: `File too large to display (${Math.round(stat.size / 1024)} KB, max ${Math.round(MAX_TEXT_FILE_BYTES / 1024)} KB). Try a smaller file.`,
        });
      }
      const content = fs.readFileSync(fullPath, "utf8");
      res.json({ path: normalized, content });
    }
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).json({ error: "File not found" });
    res.status(500).json({ error: err.message || "Failed to read file" });
  }
});

const io = new Server(httpServer, {
  cors: { origin: "*" },
});

function emitError(socket, message) {
  socket.emit("output", `\r\n\x1b[31m[Error] ${message}\x1b[0m\r\n`);
}

/** Returns true if the log contains AskUserQuestion (permission_denials or assistant tool_use). Matches real flow: exit only after user sends input. */
function logContainsAskUserQuestion(lines) {
  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (Array.isArray(data.permission_denials)) {
        if (data.permission_denials.some((d) => (d.tool_name || d.tool) === "AskUserQuestion")) return true;
      }
      if (data.type === "assistant" && Array.isArray(data.message?.content)) {
        if (data.message.content.some((c) => c.type === "tool_use" && c.name === "AskUserQuestion")) return true;
      }
    } catch (_) {
      // skip invalid JSON lines
    }
  }
  return false;
}

/** Replay a Claude output log line-by-line over socket (for MOCK_CLAUDE). Emits claude-started, then output chunks, then exit. If the log contains AskUserQuestion, exit is emitted only after the client sends "input" (same as real Claude). Returns a cancel() function to stop replay. */
function startMockClaudeReplay(socket, permissionMode, allowedTools, useContinue, onDone, sequenceFromPayload) {
  const logPath = getMockClaudeLogPath(sequenceFromPayload);
  if (!fs.existsSync(logPath)) {
    emitError(socket, `Mock Claude: log file not found: ${logPath}`);
    if (onDone) onDone();
    return () => {};
  }
  const raw = fs.readFileSync(logPath, "utf8");
  const lines = raw.split("\n").map((s) => s.trim()).filter((s) => s.startsWith("{"));
  if (lines.length === 0) {
    emitError(socket, `Mock Claude: no JSON lines in ${logPath}`);
    if (onDone) onDone();
    return () => {};
  }
  const waitForInputBeforeExit = logContainsAskUserQuestion(lines);
  socket.emit("claude-started", {
    permissionMode: permissionMode || null,
    allowedTools: allowedTools || [],
    useContinue: !!useContinue,
  });
  const delayMs = Math.max(0, parseInt(process.env.MOCK_CLAUDE_DELAY_MS || "80", 10));
  const exitDelayMs = Math.max(0, parseInt(process.env.MOCK_CLAUDE_EXIT_DELAY_MS || "60000", 10));
  let index = 0;
  let cancelled = false;
  let timeoutId = null;
  let immediateId = null;
  let inputListener = null;
  function finishReplay() {
    if (cancelled) return;
    if (waitForInputBeforeExit) {
      inputListener = (data) => {
        if (cancelled) return;
        socket.removeListener("input", inputListener);
        inputListener = null;
        // Emit a synthetic follow-up so the user sees a reply (mock log has no content after user's answer).
        const isJson = typeof data === "string" && data.trimStart().startsWith("{");
        const payload = isJson && (() => { try { return JSON.parse(data.replace(/\r$/, "")); } catch { return null; } })();
        const summary =
          payload?.message?.content?.[0]?.type === "tool_result" && typeof payload.message.content[0].content === "string"
            ? payload.message.content[0].content
            : payload?.answers && Array.isArray(payload.answers)
              ? payload.answers.map((a) => `${a.header || ""}: ${(a.selected || []).join(", ")}`).filter(Boolean).join("; ")
              : null;
        const followUpText = summary
          ? `Thanks for your choices (${summary}). I'll use that to suggest a project structure and tooling.`
          : "Thanks for your input. I'll use that to continue.";
        const followUpLine = JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: followUpText }] },
        }) + "\n";
        socket.emit("output", followUpLine);
        socket.emit("exit", { exitCode: 0 });
        if (onDone) onDone();
      };
      socket.on("input", inputListener);
    } else {
      if (exitDelayMs > 0) {
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          socket.emit("exit", { exitCode: 0 });
          if (onDone) onDone();
        }, exitDelayMs);
      } else {
        socket.emit("exit", { exitCode: 0 });
        if (onDone) onDone();
      }
    }
  }
  function sendNext() {
    if (cancelled) return;
    if (index >= lines.length) {
      finishReplay();
      return;
    }
    socket.emit("output", lines[index] + "\n");
    index += 1;
    if (delayMs > 0) timeoutId = setTimeout(sendNext, delayMs);
    else immediateId = setImmediate(sendNext);
  }
  sendNext();
  return function cancel() {
    cancelled = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (immediateId != null) {
      clearImmediate(immediateId);
      immediateId = null;
    }
    if (inputListener) {
      socket.removeListener("input", inputListener);
      inputListener = null;
    }
  };
}

io.on("connection", (socket) => {
  let ptyProcess = null;
  let hasCompletedFirstRun = false;
  let mockReplayActive = false;
  let mockReplayCancel = null;

  function claudeProcessRunning() {
    return ptyProcess !== null || mockReplayActive;
  }

  function spawnClaude(prompt, permissionMode, allowedTools, useContinue) {
    if (ptyProcess) {
      emitError(socket, "A Claude process is already running. Wait for it to finish.");
      return;
    }
    const args = [
      "--output-format", "stream-json",
      "--verbose",
      "--append-system-prompt", PAGE_RENDER_SYSTEM_PROMPT,
      ...(useContinue ? ["-c"] : []),
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
      ...(Array.isArray(allowedTools) && allowedTools.length > 0
        ? ["--allowedTools", ...allowedTools]
        : []),
      "-p", prompt,
    ];
    try {
      ptyProcess = pty.spawn("claude", args, {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: WORKSPACE_CWD,
        env: { ...process.env, TERM: "xterm-256color" },
      });

      let logStream = null;
      try {
        const logDir = path.dirname(CLAUDE_OUTPUT_LOG);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        logStream = fs.createWriteStream(CLAUDE_OUTPUT_LOG, { flags: "a" });
        const header = `\n--- Claude session started ${new Date().toISOString()} ---\n`;
        logStream.write(header);
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
        hasCompletedFirstRun = true;
        ptyProcess = null;
        if (logStream?.writable) {
          logStream.write(`\n--- Session ended (exit ${exitCode}) ${new Date().toISOString()} ---\n`);
          logStream.end();
        }
        socket.emit("exit", { exitCode });
      });
    } catch (err) {
      ptyProcess = null;
      const msg = err.code === "ENOENT"
        ? "claude not found. Install Claude Code CLI and ensure it is in PATH."
        : (err.message || "Failed to start Claude.");
      emitError(socket, msg);
    }
  }

  socket.on("submit-prompt", (payload) => {
    console.log("[submit-prompt] full input:", JSON.stringify(payload, null, 2));
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) {
      emitError(socket, "Prompt cannot be empty.");
      return;
    }
    const replaceRunning = !!payload?.replaceRunning;
    if (replaceRunning && (ptyProcess || mockReplayActive)) {
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }
      if (mockReplayCancel) {
        mockReplayCancel();
        mockReplayCancel = null;
      }
      mockReplayActive = false;
      hasCompletedFirstRun = true;
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
    const useContinue = hasCompletedFirstRun;

    if (USE_MOCK_CLAUDE) {
      // If a replay is running, stop it and allow the new one (no "already in progress" error).
      if (mockReplayCancel) {
        mockReplayCancel();
        mockReplayCancel = null;
        socket.emit("exit", { exitCode: 0 });
      }
      mockReplayActive = true;
      const seq = payload?.sequence && String(payload.sequence).trim() ? String(payload.sequence).trim() : null;
      const logPath = getMockClaudeLogPath(seq);
      console.log("[submit-prompt] mock Claude: replaying log", logPath, seq ? `(sequence: ${seq})` : "");
      mockReplayCancel = startMockClaudeReplay(socket, permissionMode || null, allowedTools, useContinue, () => {
        mockReplayActive = false;
        mockReplayCancel = null;
        hasCompletedFirstRun = true;
      }, seq);
      return;
    }
    console.log("[submit-prompt] system prompt (append):", PAGE_RENDER_SYSTEM_PROMPT);
    spawnClaude(prompt, permissionMode || null, allowedTools, useContinue);
  });

  socket.on("input", (data) => {
    console.log("[input] chat input (user reply):", typeof data === "string" ? data.replace(/\r$/, "") : JSON.stringify(data));
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  socket.on("resize", ({ cols, rows }) => {
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  });

  socket.on("claude-terminate", () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
    if (mockReplayCancel) {
      mockReplayCancel();
      mockReplayCancel = null;
    }
    mockReplayActive = false;
    socket.emit("exit", { exitCode: 0 });
  });

  socket.on("claude-debug", (payload) => {
    console.log("[claude-debug]", JSON.stringify(payload, null, 2));
  });

  const runRenderTerminals = new Map();

  function nextTerminalId() {
    return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Create a new interactive shell terminal (for "New terminal" button). */
  socket.on("run-render-new-terminal", () => {
    const terminalId = nextTerminalId();
    try {
      const isWin = process.platform === "win32";
      const child = isWin
        ? spawn("cmd", ["/K"], {
            cwd: WORKSPACE_CWD,
            stdio: ["pipe", "pipe", "pipe"],
          })
        : spawn("bash", ["-i"], {
            cwd: WORKSPACE_CWD,
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, TERM: "xterm-256color" },
          });
      runRenderTerminals.set(terminalId, child);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        socket.emit("run-render-stdout", { terminalId, chunk: String(chunk) });
      });
      child.stderr?.on("data", (chunk) => {
        socket.emit("run-render-stderr", { terminalId, chunk: String(chunk) });
      });
      child.on("exit", (code, signal) => {
        runRenderTerminals.delete(terminalId);
        socket.emit("run-render-exit", { terminalId, code, signal: signal || null });
      });
      child.on("error", (err) => {
        runRenderTerminals.delete(terminalId);
        socket.emit("run-render-stderr", { terminalId, chunk: `[error] ${err.message}\n` });
        socket.emit("run-render-exit", { terminalId, code: 1, signal: null });
      });
      socket.emit("run-render-started", { terminalId, pid: child.pid ?? null });
    } catch (err) {
      socket.emit("run-render-result", { ok: false, error: err.message || "Failed to create terminal." });
    }
  });

  /** Write input to an existing terminal (for "Run" in selected terminal). */
  socket.on("run-render-write", ({ terminalId, data }) => {
    const id = typeof terminalId === "string" ? terminalId : null;
    const str = typeof data === "string" ? data : "";
    if (!id || !str) return;
    const child = runRenderTerminals.get(id);
    if (child?.stdin?.writable) {
      child.stdin.write(str);
    }
  });

  socket.on("run-render-command", ({ command, url }) => {
    const cmd = typeof command === "string" ? command.trim() : "";
    if (!cmd) {
      socket.emit("run-render-result", { ok: false, error: "No command provided." });
      return;
    }
    const urlStr = typeof url === "string" ? url.trim() : "";
    let port = null;
    if (urlStr) {
      try {
        const u = new URL(urlStr);
        if (u.port) port = u.port;
      } catch (_) {}
    }
    if (port) killProcessOnPort(port);
    const terminalId = nextTerminalId();
    try {
      const child = spawn(cmd, {
        shell: true,
        cwd: WORKSPACE_CWD,
        stdio: ["pipe", "pipe", "pipe"],
      });
      runRenderTerminals.set(terminalId, child);
      if (child.stdin) {
        child.stdin.on("error", () => {});
      }
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        socket.emit("run-render-stdout", { terminalId, chunk: String(chunk) });
      });
      child.stderr?.on("data", (chunk) => {
        socket.emit("run-render-stderr", { terminalId, chunk: String(chunk) });
      });
      child.on("exit", (code, signal) => {
        runRenderTerminals.delete(terminalId);
        socket.emit("run-render-exit", { terminalId, code, signal: signal || null });
      });
      child.on("error", (err) => {
        runRenderTerminals.delete(terminalId);
        socket.emit("run-render-stderr", { terminalId, chunk: `[error] ${err.message}\n` });
        socket.emit("run-render-result", { ok: false, error: err.message || "Failed to run command.", terminalId });
      });
      socket.emit("run-render-started", { terminalId, pid: child.pid ?? null });
      socket.emit("run-render-result", { ok: true, url: url || "", terminalId });
    } catch (err) {
      socket.emit("run-render-result", { ok: false, error: err.message || "Failed to run command." });
    }
  });

  socket.on("run-render-terminate", ({ terminalId }) => {
    const id = typeof terminalId === "string" ? terminalId : null;
    if (id) {
      const child = runRenderTerminals.get(id);
      if (child) {
        child.kill();
        runRenderTerminals.delete(id);
      }
    }
  });

  socket.on("disconnect", () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
    if (mockReplayCancel) {
      mockReplayCancel();
      mockReplayCancel = null;
    }
    mockReplayActive = false;
    for (const child of runRenderTerminals.values()) {
      child.kill();
    }
    runRenderTerminals.clear();
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Terminal server at http://localhost:${PORT}`);
  console.log(`Listening on 0.0.0.0 for Tailscale access`);
  console.log(`Working directory: ${WORKSPACE_CWD}`);
});
