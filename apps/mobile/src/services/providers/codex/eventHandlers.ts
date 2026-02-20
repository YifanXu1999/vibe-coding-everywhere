import type { EventContext, EventHandler } from "../types";
import {
  appendOverlapTextDelta,
  appendToolUseDisplayLine,
} from "../types";

/**
 * Codex errors that mean the saved thread is invalid (e.g. state db missing rollout path for thread).
 * We match only this exact case so other "state db" errors do not clear the session.
 */
const SESSION_INVALID_PATTERNS = ["missing rollout path for thread"];

function isSessionInvalidError(message: string): boolean {
  const lower = message.toLowerCase();
  return SESSION_INVALID_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function normalizeCodexErrorMessage(raw: string, ctx: EventContext): string {
  if (isSessionInvalidError(raw)) {
    ctx.setSessionId?.(null);
    return "This session is no longer available. Start a new chat to continue.";
  }
  return raw;
}

/**
 * Register normalized Codex event handlers (mapped from codex app-server RPC events).
 *
 * Codex sends: thread.started, turn.started, turn.completed, turn.failed,
 * item.started, item.updated, item.completed, error.
 */
export function registerCodexHandlers(
  registry: Map<string, EventHandler>,
  ctx: EventContext
): void {
  registry.set("thread.started", (data) => {
    const threadId = data.thread_id as string | undefined;
    if (threadId) {
      ctx.setSessionId?.(threadId);
      console.log("[session] Codex thread_id:", threadId);
    }
  });

  registry.set("turn.started", () => {});

  registry.set("turn.completed", () => {});

  registry.set("turn.failed", (data) => {
    const err = data.error as { message?: string } | undefined;
    const raw = err?.message ?? "Turn failed.";
    const msg = normalizeCodexErrorMessage(raw, ctx);
    ctx.addMessage("system", msg);
  });

  registry.set("item.started", (data) => {
    const item = data.item as { type?: string; command?: string } | undefined;
    if (item?.type === "command_execution" && typeof item.command === "string" && item.command) {
      appendToolUseDisplayLine(ctx, "Bash", { command: item.command });
    }
  });

  registry.set("item.updated", (data) => {
    const item = data.item as { type?: string; text?: string } | undefined;
    if (item?.type === "agent_message" && typeof item.text === "string" && item.text) {
      ctx.appendAssistantText(item.text);
    }
  });

  registry.set("item.completed", (data) => {
    const item = data.item as {
      type?: string;
      text?: string;
      command?: string;
      changes?: Array<{ path?: string; kind?: string }>;
      server?: string;
      tool?: string;
      arguments?: unknown;
      status?: string;
      exit_code?: number;
    } | undefined;
    if (!item) return;
    if (item.type === "agent_message" && typeof item.text === "string" && item.text) {
      // item.updated events already streamed this text incrementally.
      // current may also contain tool-use display lines prepended before the agent message.
      appendOverlapTextDelta(ctx, item.text);
      return;
    }
    if (item.type === "command_execution") {
      // Status line (→ Completed/Failed) no longer appended to chat
      return;
    }
    if (item.type === "file_change" && Array.isArray(item.changes) && item.changes.length > 0) {
      for (const ch of item.changes) {
        const kind = ch.kind ?? "change";
        const pathStr = ch.path ?? "";
        appendToolUseDisplayLine(
          ctx,
          kind === "create" ? "Write" : kind === "edit" ? "Edit" : "Read",
          pathStr ? { file_path: pathStr, path: pathStr } : {}
        );
      }
      return;
    }
    if (item.type === "mcp_tool_call" && item.tool) {
      appendToolUseDisplayLine(ctx, item.tool, item.arguments ?? {});
    }
  });

  registry.set("error", (data) => {
    const raw = (data.message as string) ?? "Error.";
    const msg = normalizeCodexErrorMessage(raw, ctx);
    ctx.addMessage("system", msg);
  });
}
