import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import pty from "node-pty";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_CWD = __dirname;
const PORT = process.env.PORT || 3456;
const SIDEBAR_REFRESH_INTERVAL_MS = parseInt(process.env.SIDEBAR_REFRESH_INTERVAL_MS || "3000", 10) || 3000;
// Default permission mode when client does not send one (e.g. bypassPermissions = allow all for testing)
const DEFAULT_PERMISSION_MODE = process.env.DEFAULT_PERMISSION_MODE || "bypassPermissions";

const PAGE_RENDER_SYSTEM_PROMPT = `
## Page-render preview rule

When the task produces browser-viewable content (HTML, static site, dev server):
- Use a random port if the user does not specify one.
- Test the command(s) in a fresh terminal at workspace root (up to 3 attempts). Record logs.
- **Decide from the test result only:** Verified = command(s) ran with no errors. Not verified = "permission denied", "access denied", "EACCES", or any failure in the logs.
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
  res.json({ sidebarRefreshIntervalMs: SIDEBAR_REFRESH_INTERVAL_MS });
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

io.on("connection", (socket) => {
  let ptyProcess = null;
  let hasCompletedFirstRun = false;

  function claudeProcessRunning() {
    return ptyProcess !== null;
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

      ptyProcess.onData((data) => {
        socket.emit("output", data);
        const text = stripAnsi(data);
        if (text) process.stdout.write(text);
      });

      socket.emit("claude-started", {
        permissionMode: permissionMode || null,
        allowedTools: allowedTools || [],
        useContinue: !!useContinue,
      });

      ptyProcess.onExit(({ exitCode }) => {
        hasCompletedFirstRun = true;
        ptyProcess = null;
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
    console.log("[submit-prompt] chat input (user prompt):", prompt);
    console.log("[submit-prompt] system prompt (append):", PAGE_RENDER_SYSTEM_PROMPT);
    const permissionMode =
      typeof payload?.permissionMode === "string" && payload.permissionMode.trim()
        ? payload.permissionMode.trim()
        : DEFAULT_PERMISSION_MODE || null;
    const allowedTools = Array.isArray(payload?.allowedTools)
      ? payload.allowedTools.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    const useContinue = hasCompletedFirstRun;
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
