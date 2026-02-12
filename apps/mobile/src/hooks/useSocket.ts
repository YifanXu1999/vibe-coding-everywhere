import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  extractRenderCommandAndUrl,
  stripAnsi,
  stripTrailingIncompleteTag,
  isClaudeStream,
  isAskUserQuestionPayload,
  getAllowedToolsFromDenials,
} from "../utils/claudeStream";
import type {
  Message,
  CodeReference,
  PendingRender,
  PermissionDenial,
  PendingAskUserQuestion,
  LastRunOptions,
  TerminalState,
  IServerConfig,
} from "../core/types";
import { getDefaultServerConfig } from "../core/serverConfig";
import { createClaudeEventDispatcher } from "../core/claudeEventStrategies";

// Re-export types for consumers that import from useSocket
export type { Message, CodeReference, PendingRender, PermissionDenial, PendingAskUserQuestion, LastRunOptions, TerminalState };

/** Normalize path to forward slashes and, if workspace root is set, to relative path. */
function toWorkspaceRelativePath(filePath: string, workspaceRoot: string | null): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!workspaceRoot) return normalized;
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (root === "" || (!normalized.startsWith(root + "/") && normalized !== root)) return normalized;
  const rel = normalized === root ? "" : normalized.slice(root.length).replace(/^\//, "");
  return rel || normalized;
}

export interface UseSocketOptions {
  /** Injected server config (base URL). Defaults to env-based config. */
  serverConfig?: IServerConfig;
}

export function useSocket(options: UseSocketOptions = {}) {
  const serverConfig = options.serverConfig ?? getDefaultServerConfig();
  const serverUrl = serverConfig.getBaseUrl();

  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [claudeRunning, setClaudeRunning] = useState(false);
  const [waitingForUserInput, setWaitingForUserInput] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [pendingRender, setPendingRender] = useState<PendingRender | null>(null);
  const [lastRunOptions, setLastRunOptions] = useState<LastRunOptions>({
    permissionMode: null,
    allowedTools: [],
    useContinue: false,
  });
  const [permissionDenials, setPermissionDenials] = useState<PermissionDenial[] | null>(null);
  const [pendingAskQuestion, setPendingAskQuestion] = useState<PendingAskUserQuestion | null>(null);
  const [modelName, setModelName] = useState("Sonnet 4.5");
  const [runRenderResult, setRunRenderResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [terminals, setTerminals] = useState<TerminalState[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [mockSequences, setMockSequences] = useState<string[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [lastSessionTerminated, setLastSessionTerminated] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const outputBufferRef = useRef("");
  const currentAssistantContentRef = useRef("");
  const hasCompletedFirstRunRef = useRef(false);
  const nextIdRef = useRef(0);
  const workspaceRootRef = useRef<string | null>(null);
  const pendingRunCommandRef = useRef<string | null>(null);

  const addMessage = useCallback(
    (role: Message["role"], content: string, codeReferences?: CodeReference[]) => {
      const id = `msg-${++nextIdRef.current}`;
      setMessages((prev) => [...prev, { id, role, content, codeReferences }]);
      return id;
    },
    []
  );

  const appendAssistantText = useCallback((chunk: string) => {
    const sanitized = stripAnsi(chunk);
    if (!sanitized) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        const next = last.content + sanitized;
        currentAssistantContentRef.current = next;
        const nextRender = extractRenderCommandAndUrl(next);
        if (nextRender) setPendingRender(nextRender);
        return [...prev.slice(0, -1), { ...last, content: next }];
      }
      const newMsg: Message = { id: `msg-${++nextIdRef.current}`, role: "assistant", content: sanitized };
      currentAssistantContentRef.current = sanitized;
      const nextRender = extractRenderCommandAndUrl(sanitized);
      if (nextRender) setPendingRender(nextRender);
      return [...prev, newMsg];
    });
    setTypingIndicator(true);
  }, []);

  const finalizeAssistantMessage = useCallback(() => {
    setTypingIndicator(false);
    const raw = currentAssistantContentRef.current;
    const next = extractRenderCommandAndUrl(raw);
    setPendingRender(next);
    const cleaned = stripTrailingIncompleteTag(raw ?? "");
    if (cleaned !== (raw ?? "")) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: cleaned }];
        }
        return prev;
      });
      currentAssistantContentRef.current = cleaned;
    }
  }, []);

  const deduplicateDenials = useCallback((denials: PermissionDenial[]): PermissionDenial[] => {
    const seen = new Set<string>();
    return denials.filter((d) => {
      const tool = d.tool_name ?? d.tool ?? "?";
      const path = d.tool_input?.file_path ?? d.tool_input?.path ?? "";
      const key = `${tool}\n${path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const handleClaudeEvent = useCallback(
    (data: Record<string, unknown>) => {
      createClaudeEventDispatcher({
        setPermissionDenials,
        setPendingRender,
        setModelName,
        setWaitingForUserInput,
        setPendingAskQuestion,
        addMessage,
        appendAssistantText,
        getCurrentAssistantContent: () => currentAssistantContentRef.current,
        deduplicateDenials,
      })(data);
    },
    [addMessage, appendAssistantText, deduplicateDenials]
  );

  const handleRawLine = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown> | unknown[];
          const payload: Record<string, unknown> = Array.isArray(parsed) && parsed.length > 0 && isAskUserQuestionPayload(parsed[0])
            ? (parsed[0] as Record<string, unknown>)
            : (parsed as Record<string, unknown>);
          if (isClaudeStream(payload)) {
            handleClaudeEvent(payload);
            return;
          }
        } catch {
          // fall through to plain text
        }
      }
      appendAssistantText(line + "\n");
    },
    [handleClaudeEvent, appendAssistantText]
  );

  useEffect(() => {
    const socket = io(serverUrl, { transports: ["websocket", "polling"] }) as Socket;
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      fetch(`${serverUrl}/api/workspace-path`)
        .then((r) => r.json())
        .then((data: { path?: string }) => {
          if (typeof data?.path === "string") workspaceRootRef.current = data.path;
        })
        .catch(() => {});
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("output", (chunk: string) => {
      outputBufferRef.current += chunk;
      const parts = outputBufferRef.current.split("\n");
      const incomplete = parts.pop() ?? "";
      outputBufferRef.current = incomplete.startsWith("{") ? incomplete : "";

      for (const part of parts) {
        handleRawLine(part);
      }
      if (incomplete && !incomplete.startsWith("{")) {
        appendAssistantText(incomplete);
      }
    });

    socket.on(
      "claude-started",
      (payload: { permissionMode?: string | null; allowedTools?: string[]; useContinue?: boolean }) => {
        if (payload && typeof payload === "object") {
          setLastRunOptions({
            permissionMode: payload.permissionMode ?? null,
            allowedTools: Array.isArray(payload.allowedTools) ? payload.allowedTools : [],
            useContinue: !!payload.useContinue,
          });
        }
        setClaudeRunning(true);
        setLastSessionTerminated(false);
        finalizeAssistantMessage();
        setTypingIndicator(true);
        setWaitingForUserInput(false);
        setPendingAskQuestion(null);
      }
    );

    socket.on("exit", () => {
      hasCompletedFirstRunRef.current = true;
      setClaudeRunning(false);
      setWaitingForUserInput(false);
      // Do not clear pendingAskQuestion on exit: keep the modal open so the user can still
      // select and confirm; they can dismiss via Cancel. Clearing here caused the modal to
      // disappear immediately when mock replay or real Claude sent exit right after the question.
      finalizeAssistantMessage();
      console.log("[session] Chat completed.");
    });

    socket.on(
      "run-render-started",
      ({ terminalId, pid }: { terminalId: string; pid?: number | null }) => {
        const cmd = pendingRunCommandRef.current ?? "";
        pendingRunCommandRef.current = null;
        const isSingleCommand = cmd !== "";
        setTerminals((prev) => [
          ...prev,
          {
            id: terminalId,
            pid: pid ?? null,
            lines: cmd ? [{ type: "stdout" as const, text: `$ ${cmd}\n` }] : [],
            lastCommand: cmd || null,
            active: true,
            isSingleCommand,
          },
        ]);
        setSelectedTerminalId(terminalId);
      }
    );
    socket.on("run-render-stdout", ({ terminalId, chunk }: { terminalId: string; chunk: string }) => {
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === terminalId ? { ...t, lines: [...t.lines, { type: "stdout" as const, text: chunk }] } : t
        )
      );
    });
    socket.on("run-render-stderr", ({ terminalId, chunk }: { terminalId: string; chunk: string }) => {
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === terminalId ? { ...t, lines: [...t.lines, { type: "stderr" as const, text: chunk }] } : t
        )
      );
    });
    socket.on("run-render-exit", ({ terminalId }: { terminalId: string }) => {
      setTerminals((prev) => prev.map((t) => (t.id === terminalId ? { ...t, active: false } : t)));
    });
    socket.on(
      "run-render-result",
      ({
        ok,
        error,
        terminalId,
      }: { ok?: boolean; error?: string; terminalId?: string }) => {
        if (ok) {
          setRunRenderResult({ ok: true, message: "Command started. Open preview in app." });
        } else {
          if (error) setRunRenderResult({ ok: false, message: `Failed to run command: ${error}` });
          setPendingRender(null);
          if (terminalId) {
            setTerminals((prev) => prev.map((t) => (t.id === terminalId ? { ...t, active: false } : t)));
          }
        }
        setTimeout(() => setRunRenderResult(null), 4000);
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl, handleRawLine, appendAssistantText, finalizeAssistantMessage, addMessage]);

  useEffect(() => {
    if (!connected) return;
    fetch(`${serverUrl}/api/config`)
      .then((res) => res.json())
      .then((config: { useMockClaude?: boolean }) => {
        if (config?.useMockClaude) {
          return fetch(`${serverUrl}/api/mock-sequences`)
            .then((r) => r.json())
            .then((data) => setMockSequences(Array.isArray(data?.sequences) ? data.sequences : []))
            .catch(() => setMockSequences([]));
        }
        setMockSequences([]);
      })
      .catch(() => setMockSequences([]));
  }, [connected, serverUrl]);

  const submitPrompt = useCallback(
    (
      prompt: string,
      permissionMode?: string,
      allowedTools?: string[],
      codeReferences?: { path: string; startLine: number; endLine: number; snippet: string }[],
      sequence?: string | null
    ) => {
      const socket = socketRef.current;
      if (!socket || !prompt.trim()) return;

      if (pendingAskQuestion && claudeRunning) {
        // Prefer answering via AskQuestionModal; if user typed in input bar, send as plain input
        const input = `${prompt.trim()}\r`;
        console.log("[chat input] (reply to tool):", prompt.trim());
        socket.emit("input", input);
        addMessage("user", prompt.trim());
        setPendingAskQuestion(null);
        setWaitingForUserInput(false);
        return;
      }
      if (waitingForUserInput && claudeRunning) {
        const input = `${prompt.trim()}\r`;
        console.log("[chat input] (reply to tool):", prompt.trim());
        socket.emit("input", input);
        addMessage("user", prompt.trim());
        setWaitingForUserInput(false);
        return;
      }

      if (claudeRunning) return;

      setLastSessionTerminated(false);
      const refsForDisplay: CodeReference[] = [];
      let fullPrompt: string;
      const workspaceRoot = workspaceRootRef.current;
      if (codeReferences?.length) {
        const fileRefs = codeReferences
          .map((ref) => {
            const relPath = toWorkspaceRelativePath(ref.path, workspaceRoot);
            return `${relPath} (lines ${ref.startLine}-${ref.endLine})`;
          })
          .join(", ");
        fullPrompt = `Refer to the following files: ${fileRefs}\n\n${prompt.trim()}`;
        for (const ref of codeReferences) {
          refsForDisplay.push({
            path: toWorkspaceRelativePath(ref.path, workspaceRoot),
            startLine: ref.startLine,
            endLine: ref.endLine,
          });
          fullPrompt += `\n\nFrom ${toWorkspaceRelativePath(ref.path, workspaceRoot)} (lines ${ref.startLine}-${ref.endLine}):\n\`\`\`\n${ref.snippet}\n\`\`\``;
        }
      } else {
        fullPrompt = prompt.trim();
      }

      const seq = sequence ?? selectedSequence;
      console.log("[chat input] (submit-prompt):", fullPrompt, seq ? `sequence: ${seq}` : "");
      socket.emit("submit-prompt", {
        prompt: fullPrompt,
        permissionMode: permissionMode || undefined,
        allowedTools: allowedTools ?? [],
        ...(seq ? { sequence: seq } : {}),
      });
      addMessage("user", prompt.trim(), refsForDisplay.length ? refsForDisplay : undefined);
    },
    [waitingForUserInput, pendingAskQuestion, claudeRunning, addMessage, selectedSequence]
  );

  const retryAfterPermission = useCallback(
    (permissionModeOverride?: string) => {
      const allowedTools = permissionDenials ? getAllowedToolsFromDenials(permissionDenials) : [];
      setPermissionDenials(null);
      submitPrompt("Permissions granted, try again.", permissionModeOverride, allowedTools);
    },
    [permissionDenials, submitPrompt]
  );

  const dismissPermission = useCallback(() => {
    setPermissionDenials(null);
  }, []);

  const dismissAskQuestion = useCallback(() => {
    setPendingAskQuestion(null);
    setWaitingForUserInput(false);
  }, []);

  /** Submit selected answers for AskUserQuestion tool and send to backend. */
  const submitAskQuestionAnswer = useCallback(
    (answers: Array<{ header: string; selected: string[] }>) => {
      const pending = pendingAskQuestion;
      const summary = answers.map((a) => `${a.header}: ${a.selected.join(", ")}`).join("; ");
      // Always add user message so the user sees their choice in the chat, even if we can't send to backend
      addMessage("user", summary);
      setPendingAskQuestion(null);
      setWaitingForUserInput(false);

      if (!pending || !socketRef.current) return;
      // Always send to server so the CLI can continue (if it's still running). We used to require claudeRunning, but the process may have emitted "exit" before the user confirms, which would prevent us from ever sending and getting a follow-up.
      // Claude CLI with stream-json expects a "user" message with tool_result content (same format it outputs). Use newline as line terminator (JSON lines / stream-json convention).
      const toolResultContent = summary;
      const streamPayload = {
        type: "user",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: pending.tool_use_id,
              content: toolResultContent,
            },
          ],
        },
        ...(pending.uuid != null && { uuid: pending.uuid }),
      };
      const json = JSON.stringify(streamPayload);
      socketRef.current.emit("input", json + "\n");
    },
    [pendingAskQuestion, addMessage]
  );

  const runRenderCommand = useCallback((command: string, url: string) => {
    pendingRunCommandRef.current = command.trim();
    socketRef.current?.emit("run-render-command", { command: command.trim(), url });
  }, []);

  const runNewTerminal = useCallback(() => {
    socketRef.current?.emit("run-render-new-terminal");
  }, []);

  const runUserCommand = useCallback(
    (command: string) => {
      const cmd = command.trim();
      if (!cmd || !selectedTerminalId) return;
      const terminal = terminals.find((t) => t.id === selectedTerminalId);
      if (!terminal?.active) return;
      socketRef.current?.emit("run-render-write", {
        terminalId: selectedTerminalId,
        data: cmd + "\n",
      });
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === selectedTerminalId
            ? {
                ...t,
                lines: [...t.lines, { type: "stdout" as const, text: `$ ${cmd}\n` }],
                lastCommand: cmd,
              }
            : t
        )
      );
    },
    [selectedTerminalId, terminals]
  );

  const terminateRunProcess = useCallback((terminalId: string) => {
    socketRef.current?.emit("run-render-terminate", { terminalId });
    setTerminals((prev) => prev.filter((t) => t.id !== terminalId));
    setSelectedTerminalId((current) => (current === terminalId ? null : current));
  }, []);

  const terminateAgent = useCallback(() => {
    socketRef.current?.emit("claude-terminate");
    setClaudeRunning(false);
    setLastSessionTerminated(true);
    setWaitingForUserInput(false);
    setPendingAskQuestion(null);
    finalizeAssistantMessage();
  }, [finalizeAssistantMessage]);

  const runProcessActive = terminals.some((t) => t.active);
  const selectedTerminal = selectedTerminalId
    ? terminals.find((t) => t.id === selectedTerminalId)
    : terminals[terminals.length - 1] ?? null;
  const runOutputLines = selectedTerminal?.lines ?? [];
  const runCommand = selectedTerminal?.lastCommand ?? null;
  const canRunInSelectedTerminal = (() => {
    const term = selectedTerminalId ? terminals.find((t) => t.id === selectedTerminalId) : null;
    if (!term?.active) return false;
    if (term.isSingleCommand) return false;
    return true;
  })();

  return {
    connected,
    messages,
    claudeRunning,
    waitingForUserInput,
    pendingAskQuestion,
    typingIndicator,
    pendingRender,
    lastRunOptions,
    permissionDenials,
    modelName,
    runRenderResult,
    terminals,
    selectedTerminalId,
    setSelectedTerminalId,
    runOutputLines,
    runCommand,
    runProcessActive,
    submitPrompt,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    runRenderCommand,
    runNewTerminal,
    runUserCommand,
    terminateRunProcess,
    terminateAgent,
    canRunInSelectedTerminal,
    mockSequences,
    selectedSequence,
    setSelectedSequence,
    lastSessionTerminated,
  };
}
