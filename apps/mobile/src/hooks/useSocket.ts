import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  extractRenderCommandAndUrl,
  stripAnsi,
  stripTrailingIncompleteTag,
  isClaudeStream,
  getAllowedToolsFromDenials,
} from "../utils/claudeStream";

/** Code reference for display: show file name + lines instead of full code in chat. */
export type CodeReference = {
  path: string;
  startLine: number;
  endLine: number;
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** When present, show these as filename (lines) pills instead of inline code (user messages). */
  codeReferences?: CodeReference[];
};

export type PendingRender = {
  command: string;
  url: string;
};

export type PermissionDenial = {
  tool_name?: string;
  tool?: string;
  tool_input?: { file_path?: string; path?: string };
};

export type LastRunOptions = {
  permissionMode: string | null;
  allowedTools: string[];
  useContinue: boolean;
};

const getServerUrl = (): string => {
  const url = process.env.EXPO_PUBLIC_SERVER_URL;
  if (url) return url;
  return "http://localhost:3456";
};

/** Normalize path to forward slashes and, if workspace root is set, to relative path. */
function toWorkspaceRelativePath(
  filePath: string,
  workspaceRoot: string | null
): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!workspaceRoot) return normalized;
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (root === "" || (!normalized.startsWith(root + "/") && normalized !== root)) return normalized;
  const rel = normalized === root ? "" : normalized.slice(root.length).replace(/^\//, "");
  return rel || normalized;
}

export function useSocket() {
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
  const [modelName, setModelName] = useState("Sonnet 4.5");
  const [runRenderResult, setRunRenderResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [runOutputLines, setRunOutputLines] = useState<{ type: "stdout" | "stderr"; text: string }[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const outputBufferRef = useRef("");
  const currentAssistantContentRef = useRef("");
  const hasCompletedFirstRunRef = useRef(false);
  const nextIdRef = useRef(0);
  const workspaceRootRef = useRef<string | null>(null);

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
    // Strip trailing incomplete XML/HTML tag (e.g. "<u") at chat end
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

  /** Deduplicate denials by tool + path so we show at most one row per unique denial. */
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
      if (Array.isArray(data.permission_denials) && data.permission_denials.length) {
        const list = data.permission_denials as PermissionDenial[];
        setPermissionDenials(deduplicateDenials(list));
        setPendingRender(null);
      }

      switch (data.type) {
        case "system": {
          const info: string[] = [];
          if (data.session_id) info.push(`Session ID: ${data.session_id}`);
          if (data.model) {
            setModelName(String(data.model));
            info.push(`Model: ${data.model}`);
          }
          if (data.cwd) info.push(`Working Directory: ${data.cwd}`);
          if (info.length) console.log("[session]", info.join("\n"));
          break;
        }
        case "assistant": {
          const contents = (data.message as { content?: Array<{ type?: string; text?: string }> })?.content ?? [];
          const parts = contents
            .filter((c) => c.type === "text")
            .map((c) => (c as { text?: string }).text ?? "")
            .join("");
          appendAssistantText(parts);
          break;
        }
        case "input":
        case "permission_request": {
          const tool = (data.tool_name ?? data.tool ?? "Tool") as string;
          const prompt =
            (data.prompt ?? data.message ?? data.description ?? "Claude needs your input.") as string;
          setWaitingForUserInput(true);
          addMessage("system", `${tool} request:\n${prompt}\n(Type a response and press Enter)`);
          break;
        }
        case "user":
          break;
        case "result":
          break;
        default:
          if (typeof data === "string") appendAssistantText(`${data}\n`);
      }
    },
    [addMessage, appendAssistantText, deduplicateDenials]
  );

  const handleRawLine = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (isClaudeStream(parsed)) {
            handleClaudeEvent(parsed);
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
    const url = getServerUrl();
    const socket = io(url, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      fetch(`${getServerUrl()}/api/workspace-path`)
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

    socket.on("claude-started", (payload: { permissionMode?: string | null; allowedTools?: string[]; useContinue?: boolean }) => {
      if (payload && typeof payload === "object") {
        setLastRunOptions({
          permissionMode: payload.permissionMode ?? null,
          allowedTools: Array.isArray(payload.allowedTools) ? payload.allowedTools : [],
          useContinue: !!payload.useContinue,
        });
      }
      setClaudeRunning(true);
      finalizeAssistantMessage();
      setTypingIndicator(true);
      setWaitingForUserInput(false);
    });

    socket.on("exit", () => {
      hasCompletedFirstRunRef.current = true;
      setClaudeRunning(false);
      setWaitingForUserInput(false);
      finalizeAssistantMessage();
      console.log("[session] Chat completed.");
    });

    socket.on("run-render-stdout", ({ chunk }: { chunk: string }) => {
      setRunOutputLines((prev) => [...prev, { type: "stdout", text: chunk }]);
    });
    socket.on("run-render-stderr", ({ chunk }: { chunk: string }) => {
      setRunOutputLines((prev) => [...prev, { type: "stderr", text: chunk }]);
    });
    socket.on("run-render-exit", ({ code, signal }: { code: number | null; signal: string | null }) => {
      const msg = code != null ? `[Process exited with code ${code}]` : `[Process exited with signal ${signal}]`;
      setRunOutputLines((prev) => [...prev, { type: "stdout", text: msg + "\n" }]);
    });
    socket.on("run-render-result", ({ ok, error }: { ok?: boolean; error?: string }) => {
      if (ok) {
        setRunRenderResult({ ok: true, message: "Command started. Open preview in app." });
      } else {
        if (error) setRunRenderResult({ ok: false, message: `Failed to run command: ${error}` });
        setPendingRender(null);
      }
      setTimeout(() => setRunRenderResult(null), 4000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleRawLine, appendAssistantText, finalizeAssistantMessage, addMessage]);

  const submitPrompt = useCallback(
    (
      prompt: string,
      permissionMode?: string,
      allowedTools?: string[],
      codeReferences?: { path: string; startLine: number; endLine: number; snippet: string }[]
    ) => {
      const socket = socketRef.current;
      if (!socket || !prompt.trim()) return;

      if (waitingForUserInput && claudeRunning) {
        const input = `${prompt.trim()}\r`;
        console.log("[chat input] (reply to tool):", prompt.trim());
        socket.emit("input", input);
        addMessage("user", prompt.trim());
        setWaitingForUserInput(false);
        return;
      }

      if (claudeRunning) return;

      // Build full prompt: "Refer to the following files" line (paths relative to workspace), then user text, then code blocks
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

      console.log("[chat input] (submit-prompt):", fullPrompt);
      socket.emit("submit-prompt", {
        prompt: fullPrompt,
        permissionMode: permissionMode || undefined,
        allowedTools: allowedTools ?? [],
      });
      addMessage(
        "user",
        prompt.trim(),
        refsForDisplay.length ? refsForDisplay : undefined
      );
    },
    [waitingForUserInput, claudeRunning, addMessage]
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

  const runRenderCommand = useCallback((command: string, url: string) => {
    setRunOutputLines([{ type: "stdout", text: `$ ${command}\n` }]);
    socketRef.current?.emit("run-render-command", { command, url });
  }, []);

  const terminateRunProcess = useCallback(() => {
    socketRef.current?.emit("run-render-terminate");
    setRunOutputLines([]);
  }, []);

  return {
    connected,
    messages,
    claudeRunning,
    waitingForUserInput,
    typingIndicator,
    pendingRender,
    lastRunOptions,
    permissionDenials,
    modelName,
    runRenderResult,
    runOutputLines,
    submitPrompt,
    retryAfterPermission,
    dismissPermission,
    runRenderCommand,
    terminateRunProcess,
  };
}
