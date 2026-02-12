import type { Message, PermissionDenial, PendingAskUserQuestion } from "./types";
import { isAskUserQuestionPayload } from "../utils/claudeStream";

/**
 * Context passed to Claude event handlers (Strategy pattern).
 * New event types can be supported by registering a handler without modifying the dispatcher (Open-Closed).
 */
export interface ClaudeEventContext {
  setPermissionDenials: (denials: PermissionDenial[] | null) => void;
  setPendingRender: (value: { command: string; url: string } | null) => void;
  setModelName: (name: string) => void;
  setWaitingForUserInput: (value: boolean) => void;
  setPendingAskQuestion: (value: PendingAskUserQuestion | null) => void;
  addMessage: (role: Message["role"], content: string, codeReferences?: { path: string; startLine: number; endLine: number }[]) => string;
  appendAssistantText: (chunk: string) => void;
  /** Current assistant message content (for delta-only append to avoid full-text display when stream ends). */
  getCurrentAssistantContent: () => string;
  deduplicateDenials: (denials: PermissionDenial[]) => PermissionDenial[];
}

export type ClaudeEventHandler = (data: Record<string, unknown>, ctx: ClaudeEventContext) => void;

/**
 * Registry of Claude stream event handlers (Strategy pattern).
 * Extend by adding new entries to the map; dispatcher logic stays unchanged (Open-Closed).
 */
function createHandlerRegistry(ctx: ClaudeEventContext): Map<string, ClaudeEventHandler> {
  const registry = new Map<string, ClaudeEventHandler>();

  registry.set("system", (data) => {
    const info: string[] = [];
    if (data.session_id) info.push(`Session ID: ${data.session_id}`);
    if (data.model) {
      ctx.setModelName(String(data.model));
      info.push(`Model: ${data.model}`);
    }
    if (data.cwd) info.push(`Working Directory: ${data.cwd}`);
    if (info.length) console.log("[session]", info.join("\n"));
  });

  registry.set("assistant", (data) => {
    const contents = (data.message as { content?: Array<{ type?: string; text?: string }> })?.content ?? [];
    const full = contents
      .filter((c) => c.type === "text")
      .map((c) => (c as { text?: string }).text ?? "")
      .join("");
    if (!full) return;
    const current = ctx.getCurrentAssistantContent();
    // Only append delta so we don't re-display full text when a final "assistant" event arrives at stream end.
    const delta = current.length > 0 && full.startsWith(current) ? full.slice(current.length) : full;
    if (delta) ctx.appendAssistantText(delta);
  });

  registry.set("stream_event", (data) => {
    const ev = data.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (ev?.type === "content_block_delta") {
      const text = ev.delta && typeof (ev.delta as { text?: string }).text === "string" ? (ev.delta as { text: string }).text : "";
      if (text) ctx.appendAssistantText(text);
    }
  });

  const inputLikeHandler: ClaudeEventHandler = (data) => {
    const tool = (data.tool_name ?? data.tool ?? "Tool") as string;
    const prompt =
      (data.prompt ?? data.message ?? data.description ?? "Claude needs your input.") as string;
    ctx.setWaitingForUserInput(true);
    ctx.addMessage("system", `${tool} request:\n${prompt}\n(Type a response and press Enter)`);
  };
  registry.set("input", inputLikeHandler);
  registry.set("permission_request", inputLikeHandler);

  registry.set("user", () => {});
  registry.set("result", () => {});

  return registry;
}

/**
 * Dispatches a Claude stream event to the registered handler for data.type.
 * Handles permission_denials before type; falls back to appending as text for unknown types.
 */
function normalizeAskUserQuestionPayload(data: Record<string, unknown>): PendingAskUserQuestion | null {
  const toolUseId = String(data.tool_use_id ?? "");
  const input = data.tool_input as Record<string, unknown> | undefined;
  const questions = input?.questions as Array<{ question?: string; header: string; options: Array<{ label: string; description?: string }>; multiSelect?: boolean }> | undefined;
  if (!toolUseId || !Array.isArray(questions) || questions.length === 0) return null;
  const uuid = data.uuid ?? input?.uuid;
  return {
    tool_use_id: toolUseId,
    uuid: uuid != null ? String(uuid) : undefined,
    questions: questions.map((q) => ({
      question: q.question,
      header: q.header ?? "",
      options: Array.isArray(q.options) ? q.options.map((o) => ({ label: String(o?.label ?? ""), description: o?.description != null ? String(o.description) : undefined })) : [],
      multiSelect: !!q.multiSelect,
    })),
  };
}

/** AskUserQuestion is handled by the question modal. Returns filtered list and extracted AskUserQuestion payload if any. */
function processPermissionDenials(
  denials: PermissionDenial[],
  topLevelData: Record<string, unknown>
): { filteredDenials: PermissionDenial[]; askUserQuestionPayload: Record<string, unknown> | null } {
  let askPayload: Record<string, unknown> | null = null;
  const filtered = denials.filter((d) => {
    const tool = d.tool_name ?? d.tool ?? "";
    if (String(tool).trim() !== "AskUserQuestion") return true;
    const input = (d as Record<string, unknown>).tool_input as Record<string, unknown> | undefined;
    if (input && Array.isArray(input.questions) && input.questions.length > 0) {
      askPayload = {
        tool_name: "AskUserQuestion",
        tool_use_id: (d as Record<string, unknown>).tool_use_id,
        tool_input: input,
        uuid: topLevelData.uuid ?? input.uuid,
      };
    }
    return false;
  });
  return { filteredDenials: filtered, askUserQuestionPayload: askPayload };
}

export function createClaudeEventDispatcher(ctx: ClaudeEventContext): (data: Record<string, unknown>) => void {
  const registry = createHandlerRegistry(ctx);
  return (data: Record<string, unknown>) => {
    if (Array.isArray(data.permission_denials) && data.permission_denials.length) {
      const list = data.permission_denials as PermissionDenial[];
      const deduped = ctx.deduplicateDenials(list);
      const { filteredDenials, askUserQuestionPayload } = processPermissionDenials(deduped, data);
      ctx.setPermissionDenials(filteredDenials.length > 0 ? filteredDenials : null);
      ctx.setPendingRender(null);
      if (askUserQuestionPayload) {
        const pending = normalizeAskUserQuestionPayload(askUserQuestionPayload);
        if (pending) {
          ctx.setPendingAskQuestion(pending);
          ctx.setWaitingForUserInput(true);
          ctx.addMessage("system", "Please select your choices below and confirm.");
        }
      }
    }
    if (isAskUserQuestionPayload(data)) {
      const pending = normalizeAskUserQuestionPayload(data);
      if (pending) {
        ctx.setPendingAskQuestion(pending);
        ctx.setWaitingForUserInput(true);
        ctx.addMessage("system", "Please select your choices below and confirm.");
      }
      return;
    }
    const type = String(data.type ?? "");
    const handler = registry.get(type);
    if (handler) {
      handler(data, ctx);
    } else {
      if (typeof data === "string") ctx.appendAssistantText(`${data}\n`);
    }
  };
}
