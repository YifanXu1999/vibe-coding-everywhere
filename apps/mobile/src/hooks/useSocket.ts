import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  extractRenderCommandAndUrl,
  stripAnsi,
  isClaudeStream,
  getAllowedToolsFromDenials,
} from "../utils/claudeStream";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
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

  const socketRef = useRef<Socket | null>(null);
  const outputBufferRef = useRef("");
  const currentAssistantContentRef = useRef("");
  const hasCompletedFirstRunRef = useRef(false);
  const nextIdRef = useRef(0);

  const addMessage = useCallback((role: Message["role"], content: string) => {
    const id = `msg-${++nextIdRef.current}`;
    setMessages((prev) => [...prev, { id, role, content }]);
    return id;
  }, []);

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
  }, []);

  const handleClaudeEvent = useCallback(
    (data: Record<string, unknown>) => {
      if (Array.isArray(data.permission_denials) && data.permission_denials.length) {
        setPermissionDenials(data.permission_denials as PermissionDenial[]);
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
          if (info.length) addMessage("system", info.join("\n"));
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
    [addMessage, appendAssistantText]
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

    socket.on("connect", () => setConnected(true));
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
      addMessage("system", "Chat completed.");
    });

    socket.on("run-render-result", ({ ok, error }: { ok?: boolean; error?: string }) => {
      if (ok) {
        setRunRenderResult({ ok: true, message: "Render command started. Preview should open." });
      } else if (error) {
        setRunRenderResult({ ok: false, message: `Failed to run command: ${error}` });
      }
      setTimeout(() => setRunRenderResult(null), 4000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleRawLine, appendAssistantText, finalizeAssistantMessage, addMessage]);

  const submitPrompt = useCallback(
    (prompt: string, permissionMode?: string, allowedTools?: string[]) => {
      const socket = socketRef.current;
      if (!socket || !prompt.trim()) return;

      if (waitingForUserInput && claudeRunning) {
        socket.emit("input", `${prompt.trim()}\r`);
        addMessage("user", prompt.trim());
        setWaitingForUserInput(false);
        return;
      }

      if (claudeRunning) return;

      socket.emit("submit-prompt", {
        prompt: prompt.trim(),
        permissionMode: permissionMode || undefined,
        allowedTools: allowedTools ?? [],
      });
      addMessage("user", prompt.trim());
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
    socketRef.current?.emit("run-render-command", { command, url });
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
    submitPrompt,
    retryAfterPermission,
    dismissPermission,
    runRenderCommand,
  };
}
