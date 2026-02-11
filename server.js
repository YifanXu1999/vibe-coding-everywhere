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

const PAGE_RENDER_SYSTEM_PROMPT = `
## MANDATORY: Page-render preview rule (non-negotiable)

When the user's task produces or modifies content that is meant to be viewed in a browser (HTML, static site, dev server, etc.)
**Query Rewrite:**
1. If user does not specify the port to render, render it at a random available port.
**Verification:**
1. Must test the command(s) in a fresh terminal at the workspace directory. And then return full commands to the user.
2. Record the logs of the command(s) execution. 
3. Maximum of 3 attempts to verify the command(s).
4. If no permission denied, then verified.
**Output Format if verified:**
1. The line MUST be exactly in this form (no variations):
   Run the following command for render: "<command(s)>"
   URL for preview: "<url_to_render>"
2. <command(s)> MUST be the full-chain, copy-pastable command(s) that the user runs from a fresh terminal at the workspace directory to serve/host the webpage or website, instead of just running a command to open the page.
3. <url_to_render> MUST be the URL of the webpage or website that the user can access to view the rendered content after running the command(s)
4. The output should only contain the command(s) and the url to render, no other text.
**Output Format if not verified:**
1. The line MUST be exactly in this form (no variations):
   Need permission for the following commands: "<command(s)>"
2. <command(s)> MUST be the full-chain, copy-pastable command(s) that the user runs from a fresh terminal at the workspace directory to serve/host the webpage or website, instead of just running a command to open the page.
3. The output should only contain the command(s), no other text.
`
const app = express();
const httpServer = createServer(app);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
    const permissionMode = typeof payload?.permissionMode === "string" ? payload.permissionMode.trim() : null;
    const allowedTools = Array.isArray(payload?.allowedTools)
      ? payload.allowedTools.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    const useContinue = hasCompletedFirstRun;
    spawnClaude(prompt, permissionMode || null, allowedTools, useContinue);
  });

  socket.on("input", (data) => {
    console.log("[input] full input:", JSON.stringify(data));
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

  socket.on("run-render-command", ({ command, url }) => {
    const cmd = typeof command === "string" ? command.trim() : "";
    if (!cmd) {
      socket.emit("run-render-result", { ok: false, error: "No command provided." });
      return;
    }
    try {
      const child = spawn(cmd, {
        shell: true,
        cwd: WORKSPACE_CWD,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      socket.emit("run-render-result", { ok: true, url: url || "" });
    } catch (err) {
      socket.emit("run-render-result", { ok: false, error: err.message || "Failed to run command." });
    }
  });

  socket.on("disconnect", () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Terminal server at http://localhost:${PORT}`);
  console.log(`Listening on 0.0.0.0 for Tailscale access`);
  console.log(`Working directory: ${WORKSPACE_CWD}`);
});
