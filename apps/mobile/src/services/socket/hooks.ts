/**
 * useSocket hook - Main state management for Socket.IO connection and Claude sessions.
 * 
 * This hook manages:
 * - Socket.IO connection lifecycle
 * - Chat message state
 * - Claude session state (running, waiting for input)
 * - Terminal processes
 * - Permission handling
 * - File rendering
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  extractRenderCommandAndUrl,
  filterBashNoise,
  stripAnsi,
  stripTrailingIncompleteTag,
  isProviderStream,
  isAskUserQuestionPayload,
  getAllowedToolsFromDenials,
  isProviderSystemNoise,
} from "../providers/stream";
import type {
  Message,
  CodeReference,
  PendingRender,
  PermissionDenial,
  PendingAskUserQuestion,
  LastRunOptions,
  TerminalState,
  IServerConfig,
} from "../../core/types";
import { getDefaultServerConfig } from "../server/config";
import { createEventDispatcher } from "../providers/eventDispatcher";
import type { Provider } from "../../theme/index";
import type { CodeRefPayload } from "../../components/file/FileViewerModal";

// Re-export types for consumers that import from useSocket
export type { Message, CodeReference, PendingRender, PermissionDenial, PendingAskUserQuestion, LastRunOptions, TerminalState };

/**
 * Normalize file path to use forward slashes.
 * If workspace root is provided, converts absolute paths to relative paths.
 * 
 * @param filePath - Original file path
 * @param workspaceRoot - Workspace root directory (optional)
 * @returns Normalized relative or absolute path
 */
function toWorkspaceRelativePath(filePath: string, workspaceRoot: string | null): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!workspaceRoot) return normalized;
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (root === "" || (!normalized.startsWith(root + "/") && normalized !== root)) return normalized;
  const rel = normalized === root ? "" : normalized.slice(root.length).replace(/^\//, "");
  return rel || normalized;
}

/** Options for useSocket hook */
export interface UseSocketOptions {
  /** Injected server config (base URL). Defaults to env-based config. */
  serverConfig?: IServerConfig;
  /** AI provider for submit-prompt ("claude" | "gemini"). */
  provider?: Provider;
  /** Model ID for submit-prompt (e.g. "sonnet", "gemini-2.5-flash"). Defaults by provider. */
  model?: string;
}

/**
 * Main hook for managing Socket.IO connection and Claude sessions.
 * 
 * @param options - Configuration options
 * @returns Object containing connection state, messages, and action handlers
 */
export function useSocket(options: UseSocketOptions = {}) {
  // Server configuration - can be injected for testing
  const serverConfig = options.serverConfig ?? getDefaultServerConfig();
  const serverUrl = serverConfig.getBaseUrl();
  const provider = options.provider ?? "gemini";
  const defaultModel = provider === "claude" ? "sonnet" : "gemini-2.5-flash";
  const model = options.model ?? defaultModel;

  // ===== Connection State =====
  const [connected, setConnected] = useState(false);
  
  // ===== Chat State =====
  const [messages, setMessages] = useState<Message[]>([]);
  const [claudeRunning, setClaudeRunning] = useState(false);
  const [waitingForUserInput, setWaitingForUserInput] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  
  // ===== Permission State =====
  const [permissionDenials, setPermissionDenials] = useState<PermissionDenial[] | null>(null);
  const [lastRunOptions, setLastRunOptions] = useState<LastRunOptions>({
    permissionMode: null,
    allowedTools: [],
    useContinue: false,
  });
  
  // ===== Render/Preview State =====
  /** When set, shows the command/URL box. Execution only on explicit user click. */
  const [pendingRender, setPendingRender] = useState<PendingRender | null>(null);
  const [hasRunCommandForCurrentRender, setHasRunCommandForCurrentRender] = useState(false);
  const [renderTerminalId, setRenderTerminalId] = useState<string | null>(null);
  
  // ===== Question Modal State =====
  const [pendingAskQuestion, setPendingAskQuestion] = useState<PendingAskUserQuestion | null>(null);
  
  // ===== Terminal State =====
  const [terminals, setTerminals] = useState<TerminalState[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [runOutputLines, setRunOutputLines] = useState<{ type: "stdout" | "stderr"; text: string }[]>([]);
  const [runCommand, setRunCommand] = useState<string | null>(null);
  const [runProcessActive, setRunProcessActive] = useState(false);
  const [runRenderResult, setRunRenderResult] = useState<{ ok: boolean; message: string } | null>(null);
  
  // ===== Model Info =====
  const [modelName, setModelName] = useState("Sonnet 4.5");
  
  // ===== Session Tracking =====
  const [lastSessionTerminated, setLastSessionTerminated] = useState(false);
  const [mockSequences, setMockSequences] = useState<string[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);

  // ===== Refs for managing state across renders =====
  const socketRef = useRef<Socket | null>(null);
  const outputBufferRef = useRef("");
  const currentAssistantContentRef = useRef("");
  const hasCompletedFirstRunRef = useRef(false);
  const nextIdRef = useRef(0);
  const workspaceRootRef = useRef<string | null>(null);
  const pendingRunCommandRef = useRef<string | null>(null);
  const pendingCommandAfterNewTerminalRef = useRef<string | null>(null);
  const pendingRenderKeyRef = useRef<string>("");
  const renderTerminalIdRef = useRef<string | null>(null);
  const toolUseByIdRef = useRef<Map<string, { tool_name: string; tool_input?: Record<string, unknown> }>>(new Map());

  /**
   * Add a new message to the chat.
   * Generates a unique ID for each message.
   */
  const addMessage = useCallback(
    (role: Message["role"], content: string, codeReferences?: CodeReference[]) => {
      const id = `msg-${++nextIdRef.current}`;
      setMessages((prev) => [...prev, { id, role, content, codeReferences }]);
      return id;
    },
    []
  );

  /**
   * Append text to the current assistant message.
   * Creates a new assistant message if the last message isn't from assistant.
   * Also extracts render commands from the content.
   */
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

  /**
   * Finalize the current assistant message when streaming ends.
   * Strips incomplete tags and cleans up empty messages.
   */
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
          const trimmed = cleaned.trim();
          if (trimmed === "") {
            return prev.slice(0, -1);
          }
          return [...prev.slice(0, -1), { ...last, content: cleaned }];
        }
        return prev;
      });
      currentAssistantContentRef.current = cleaned;
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && (last.content ?? "").trim() === "") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    currentAssistantContentRef.current = "";
  }, []);

  /**
   * Remove duplicate permission denials based on tool name and path.
   */
  const deduplicateDenials = useCallback((denials: PermissionDenial[]): PermissionDenial[] => {
    const seen = new Set<string>();
    return denials.filter((d) => {
      const tool = d.tool_name ?? d.tool ?? "?";
      const pathKey = d.tool_input?.file_path ?? d.tool_input?.path ?? "";
      const key = `${tool}:${pathKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const recordToolUse = useCallback((id: string, data: { tool_name: string; tool_input?: Record<string, unknown> }) => {
    toolUseByIdRef.current.set(id, data);
  }, []);

  const getAndClearToolUse = useCallback((id: string) => {
    const m = toolUseByIdRef.current;
    const v = m.get(id);
    m.delete(id);
    return v ?? null;
  }, []);

  const addPermissionDenial = useCallback(
    (denial: PermissionDenial) => {
      setPermissionDenials((prev) => deduplicateDenials([...(prev ?? []), denial]));
    },
    [deduplicateDenials]
  );

  // ===== Socket.IO Connection Setup =====
  useEffect(() => {
    // Initialize Socket.IO connection
    const socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      timeout: 20000,
    });
    socketRef.current = socket;

    // Connection events
    socket.on("connect", () => {
      console.log("[socket] connected");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[socket] disconnected");
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[socket] connect_error:", err.message);
      setConnected(false);
    });

    // Claude session events
    socket.on("claude-started", (data) => {
      console.log("[claude-started]", data);
      setClaudeRunning(true);
      setTypingIndicator(true);
      setWaitingForUserInput(false);
      setLastSessionTerminated(false);
      setLastRunOptions({
        permissionMode: data.permissionMode ?? null,
        allowedTools: data.allowedTools ?? [],
        useContinue: data.useContinue ?? false,
      });
    });

    // Main output handler - receives all provider (Claude/Gemini) output
    socket.on("output", (data: string) => {
      outputBufferRef.current += data;
      const lines = outputBufferRef.current.split("\n");
      outputBufferRef.current = lines.pop() ?? "";
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Strip ANSI escape codes before parsing (PTY may wrap JSON in escape sequences)
        const clean = stripAnsi(trimmed);
        if (!clean) continue;

        // Filter known provider CLI system noise (Gemini startup messages, etc.)
        if (isProviderSystemNoise(clean)) continue;
        
        // Try to parse as JSON (provider stream format)
        try {
          const parsed = JSON.parse(clean);
          if (isProviderStream(parsed)) {
            // Handle AI stream events via dispatcher (Claude/Gemini)
            const dispatcher = createEventDispatcher({
              setPermissionDenials: (d) => setPermissionDenials(d ? deduplicateDenials(d) : null),
              setPendingRender,
              setModelName,
              setWaitingForUserInput,
              setPendingAskQuestion,
              addMessage,
              appendAssistantText,
              getCurrentAssistantContent: () => currentAssistantContentRef.current,
              deduplicateDenials,
              recordToolUse,
              getAndClearToolUse,
              addPermissionDenial,
            });
            dispatcher(parsed);
          } else {
            appendAssistantText(clean + "\n");
          }
        } catch {
          // Not JSON - treat as plain text output
          appendAssistantText(clean + "\n");
        }
      }
    });

    // Session ended
    socket.on("exit", ({ exitCode }: { exitCode: number }) => {
      console.log("[exit] code:", exitCode);
      setClaudeRunning(false);
      setTypingIndicator(false);
      setWaitingForUserInput(false);
      finalizeAssistantMessage();
      
      if (exitCode !== 0) {
        setLastSessionTerminated(true);
      }
      
      if (!hasCompletedFirstRunRef.current && exitCode === 0) {
        hasCompletedFirstRunRef.current = true;
      }
    });

    // Terminal/run-render events
    socket.on("run-render-started", ({ terminalId, pid }: { terminalId: string; pid: number | null }) => {
      setTerminals((prev) => [...prev, { id: terminalId, pid, lines: [], active: true, lastCommand: pendingRunCommandRef.current, isSingleCommand: false }]);
      setRunProcessActive(true);
      
      // If we have a pending command for this terminal, send it
      if (pendingCommandAfterNewTerminalRef.current) {
        socket.emit("run-render-write", { terminalId, data: pendingCommandAfterNewTerminalRef.current + "\n" });
        pendingCommandAfterNewTerminalRef.current = null;
      }
    });

    socket.on("run-render-stdout", ({ terminalId, chunk }: { terminalId: string; chunk: string }) => {
      const filtered = filterBashNoise(chunk);
      if (!filtered) return;
      
      setTerminals((prev) => {
        const idx = prev.findIndex((t) => t.id === terminalId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], lines: [...next[idx].lines, { type: "stdout", text: filtered }] };
        return next;
      });
      
      setRunOutputLines((prev) => [...prev, { type: "stdout", text: filtered }]);
    });

    socket.on("run-render-stderr", ({ terminalId, chunk }: { terminalId: string; chunk: string }) => {
      setTerminals((prev) => {
        const idx = prev.findIndex((t) => t.id === terminalId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], lines: [...next[idx].lines, { type: "stderr", text: chunk }] };
        return next;
      });
      
      setRunOutputLines((prev) => [...prev, { type: "stderr", text: chunk }]);
    });

    socket.on("run-render-exit", ({ terminalId, code }: { terminalId: string; code: number | null }) => {
      setTerminals((prev) => {
        const idx = prev.findIndex((t) => t.id === terminalId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], active: false };
        return next;
      });
      setRunProcessActive(false);
    });

    socket.on("run-render-result", (result: { ok: boolean; message?: string; terminalId?: string }) => {
      setRunRenderResult({ ok: result.ok, message: result.message ?? (result.ok ? "Command executed" : "Command failed") });
      if (result.ok && result.terminalId) {
        setRenderTerminalId(result.terminalId);
        renderTerminalIdRef.current = result.terminalId;
        setHasRunCommandForCurrentRender(true);
      }
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, [serverUrl, recordToolUse, getAndClearToolUse, addPermissionDenial, deduplicateDenials]);

  // ===== Action Handlers =====

  /**
   * Submit a prompt to Claude/Gemini.
   * @param prompt - The user prompt
   * @param permissionMode - Optional Claude permission mode
   * @param allowedTools - Optional allowed tools list
   * @param codeRefs - Optional code references to include
   * @param approvalMode - Optional Gemini approval mode
   */
  const submitPrompt = useCallback(
    (prompt: string, permissionMode?: string, allowedTools?: string[], codeRefs?: CodeRefPayload[], approvalMode?: string) => {
      if (!socketRef.current) return;
      
      // Build full prompt with code references if provided
      let fullPrompt = prompt;
      if (codeRefs && codeRefs.length > 0) {
        const refsText = codeRefs
          .map((ref) => `File: ${ref.path}\n\`\`\`\n${ref.snippet}\n\`\`\``)
          .join("\n\n");
        fullPrompt = `${refsText}\n\n${prompt}`;
      }
      
      socketRef.current.emit("submit-prompt", {
        prompt: fullPrompt,
        permissionMode,
        allowedTools,
        provider,
        model,
        approvalMode,
      });
      
      // Add user message to chat
      addMessage("user", prompt);
      setPermissionDenials(null);
      setPendingRender(null);
      setHasRunCommandForCurrentRender(false);
      setRenderTerminalId(null);
      renderTerminalIdRef.current = null;
      setLastSessionTerminated(false);
    },
    [addMessage, provider, model]
  );

  /**
   * Submit answer to AskUserQuestion modal.
   * @param answers - Selected answers
   */
  const submitAskQuestionAnswer = useCallback(
    (answers: Array<{ header: string; selected: string[] }>) => {
      if (!socketRef.current || !pendingAskQuestion) return;
      
      const payload = {
        tool_use_id: pendingAskQuestion.tool_use_id,
        answers,
      };
      
      socketRef.current.emit("input", JSON.stringify({ message: { content: [{ type: "tool_result", content: JSON.stringify(answers) }] } }));
      setPendingAskQuestion(null);
      setWaitingForUserInput(false);
    },
    [pendingAskQuestion]
  );

  /**
   * Dismiss the AskUserQuestion modal without answering.
   */
  const dismissAskQuestion = useCallback(() => {
    setPendingAskQuestion(null);
    setWaitingForUserInput(false);
  }, []);

  /**
   * Retry after permission denial with updated permissions.
   * @param permissionMode - New Claude permission mode
   * @param approvalMode - New Gemini approval mode
   */
  const retryAfterPermission = useCallback(
    (permissionMode?: string, approvalMode?: string) => {
      if (!socketRef.current) return;
      
      const denials = permissionDenials ?? [];
      const allowedTools = getAllowedToolsFromDenials(denials);
      
      socketRef.current.emit("submit-prompt", {
        prompt: "", // Empty prompt to continue
        permissionMode: permissionMode ?? lastRunOptions.permissionMode ?? undefined,
        approvalMode,
        allowedTools,
        replaceRunning: true,
        provider,
        model,
      });
      
      setPermissionDenials(null);
    },
    [permissionDenials, lastRunOptions, provider, model]
  );

  /**
   * Dismiss permission denial banner.
   */
  const dismissPermission = useCallback(() => {
    setPermissionDenials(null);
  }, []);

  /**
   * Create a new interactive terminal.
   */
  const runNewTerminal = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("run-render-new-terminal");
    setRunCommand(null);
    setRunOutputLines([]);
  }, []);

  /**
   * Run a command in a new terminal.
   * @param command - Shell command to execute
   */
  const runCommandInNewTerminal = useCallback(
    (command: string) => {
      if (!socketRef.current) return;
      pendingRunCommandRef.current = command;
      pendingCommandAfterNewTerminalRef.current = command;
      socketRef.current.emit("run-render-new-terminal");
    },
    []
  );

  /**
   * Run a user command in the currently selected terminal.
   * @param command - Shell command to execute
   */
  const runUserCommand = useCallback(
    (command: string) => {
      if (!socketRef.current || !selectedTerminalId) return;
      socketRef.current.emit("run-render-write", { terminalId: selectedTerminalId, data: command + "\n" });
    },
    [selectedTerminalId]
  );

  /**
   * Terminate a terminal process.
   * @param terminalId - Terminal to terminate
   */
  const terminateRunProcess = useCallback(
    (terminalId: string) => {
      if (!socketRef.current) return;
      socketRef.current.emit("run-render-terminate", { terminalId });
    },
    []
  );

  /**
   * Terminate the current Claude session.
   */
  const terminateAgent = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("claude-terminate");
    setLastSessionTerminated(true);
  }, []);

  /**
   * New session: clear chat and reset permission state; optionally terminate running agent.
   */
  const resetSession = useCallback(() => {
    if (socketRef.current) socketRef.current.emit("claude-terminate");
    setMessages([]);
    setPermissionDenials(null);
    setLastRunOptions({ permissionMode: null, allowedTools: [], useContinue: false });
    setPendingRender(null);
    setPendingAskQuestion(null);
    setHasRunCommandForCurrentRender(false);
    setRenderTerminalId(null);
    renderTerminalIdRef.current = null;
    setLastSessionTerminated(false);
    currentAssistantContentRef.current = "";
  }, []);

  // Compute whether user can run commands in selected terminal
  const canRunInSelectedTerminal = selectedTerminalId
    ? terminals.find((t) => t.id === selectedTerminalId)?.active ?? false
    : false;

  return {
    // Connection state
    connected,
    
    // Chat state
    messages,
    claudeRunning,
    waitingForUserInput,
    typingIndicator,
    
    // Permission state
    permissionDenials,
    lastRunOptions,
    
    // Render state
    pendingRender,
    runRenderResult,
    hasRunCommandForCurrentRender,
    renderTerminalId,
    
    // Question modal state
    pendingAskQuestion,
    
    // Terminal state
    terminals,
    selectedTerminalId,
    setSelectedTerminalId,
    runOutputLines,
    runCommand,
    runProcessActive,
    canRunInSelectedTerminal,
    
    // Mock sequences
    mockSequences,
    selectedSequence,
    setSelectedSequence,
    
    // Session tracking
    lastSessionTerminated,
    
    // Actions
    submitPrompt,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    runNewTerminal,
    runCommandInNewTerminal,
    runUserCommand,
    terminateRunProcess,
    terminateAgent,
    resetSession,
  };
}
