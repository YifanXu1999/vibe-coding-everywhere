import fs from "fs";
import { spawn } from "child_process";

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
    const toolName =
      typeof params?.tool === "string" && params.tool.trim() ? params.tool.trim() : "unknown-tool";
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

function codexApprovalPolicy(opts) {
  if (opts.yolo === true) return "never";
  if (opts.fullAuto === true) return "on-request";
  if (typeof opts.askForApproval === "string" && opts.askForApproval.trim()) {
    return opts.askForApproval.trim();
  }
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

export function createCodexAppServerSession({
  socket,
  hasCompletedFirstRunRef,
  sessionManagement,
  globalSpawnChildren,
  getWorkspaceCwd,
  getChatSystemPrompt,
  getLlmCliIoTurnPaths,
  formatCommandForLog,
}) {
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

  function emitOutputLine(line) {
    socket.emit("output", line);
    if (codexIoOutputStream?.writable) codexIoOutputStream.write(line);
  }

  function emitCodexEvent(event) {
    const line = JSON.stringify(event) + "\n";
    emitOutputLine(line);
  }

  function writeApprovalDecisionResponse(idRaw, approved) {
    codexAppProcess?.stdin?.write(
      JSON.stringify({ id: idRaw, result: { decision: approved ? "accept" : "decline" } }) + "\n"
    );
  }

  function closeCodexIoOutputStream() {
    if (!codexIoOutputStream?.writable) return;
    try {
      codexIoOutputStream.end();
    } catch (_) {}
    codexIoOutputStream = null;
  }

  function clearCodexPendingRequests(errorMessage) {
    for (const { reject } of codexPendingRequests.values()) {
      reject(new Error(errorMessage));
    }
    codexPendingRequests.clear();
  }

  function close() {
    closeCodexIoOutputStream();
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
        emitOutputLine(line);
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
    if (
      hasId &&
      (Object.prototype.hasOwnProperty.call(parsed, "result") ||
        Object.prototype.hasOwnProperty.call(parsed, "error"))
    ) {
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
        if (sessionManagement) sessionManagement.session_id = threadId;
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
      closeCodexIoOutputStream();
      if (status === "errored" || status === "failed") {
        emitCodexEvent({
          type: "turn.failed",
          error: { message: parsed?.params?.turn?.error?.message ?? "Turn failed." },
        });
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
          emitOutputLine(out);
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

  async function startTurn({ prompt, options }) {
    const approvalPolicy = codexApprovalPolicy(options);
    const sandboxMode = codexThreadSandboxMode(options);
    const useContinueForEvent = !!hasCompletedFirstRunRef.value;
    await ensureCodexAppServer(options);

    const shouldStartNewThread =
      !sessionManagement?.session_id ||
      !codexThreadId ||
      codexThreadId !== sessionManagement.session_id;
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
        if (sessionManagement) sessionManagement.session_id = threadId;
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
      closeCodexIoOutputStream();
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
  }

  function handleInput(data) {
    if (!codexAppProcess || !codexPendingServerRequest) return false;
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    const answers = parseAskQuestionAnswersFromInput(raw);
    const approved = decideApprovalFromAnswers(answers, typeof data === "string" ? data : "");
    const pending = codexPendingServerRequest;
    codexPendingServerRequest = null;

    if (pending.method === "item/commandExecution/requestApproval") {
      writeApprovalDecisionResponse(pending.idRaw, approved);
      return true;
    }
    if (pending.method === "item/fileChange/requestApproval") {
      writeApprovalDecisionResponse(pending.idRaw, approved);
      return true;
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
      codexAppProcess.stdin.write(
        JSON.stringify({ id: pending.idRaw, result: { answers: answerMap } }) + "\n"
      );
      return true;
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
      return true;
    }
    return true;
  }

  function hasProcess() {
    return codexAppProcess !== null;
  }

  function isTurnRunning() {
    return codexTurnRunning;
  }

  return {
    hasProcess,
    isTurnRunning,
    close,
    startTurn,
    handleInput,
  };
}
