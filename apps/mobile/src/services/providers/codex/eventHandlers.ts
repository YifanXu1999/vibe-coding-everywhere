import type { EventContext, EventHandler } from "../types";
import { formatToolUseForDisplay } from "../types";

/** Codex errors that mean the saved thread is invalid; show friendly message and clear session. */
const SESSION_INVALID_PATTERNS = [
  "missing rollout path for thread",
  "state db",
  "rollout path for thread",
];

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
 * Register Codex CLI (codex exec --json) event handlers into the given registry.
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

  registry.set("item.started", () => {});

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
    } | undefined;
    if (!item) return;
    if (item.type === "agent_message" && typeof item.text === "string" && item.text) {
      const current = ctx.getCurrentAssistantContent();
      const delta = current.length > 0 && item.text.startsWith(current)
        ? item.text.slice(current.length)
        : item.text;
      if (delta) ctx.appendAssistantText(delta);
      return;
    }
    if (item.type === "command_execution" && item.command) {
      const line = formatToolUseForDisplay("Bash", { command: item.command });
      ctx.appendAssistantText("\n\n" + line + "\n\n");
      return;
    }
    if (item.type === "file_change" && Array.isArray(item.changes) && item.changes.length > 0) {
      for (const ch of item.changes) {
        const kind = ch.kind ?? "change";
        const pathStr = ch.path ?? "";
        const line = formatToolUseForDisplay(
          kind === "create" ? "Write" : kind === "edit" ? "Edit" : "Read",
          pathStr ? { file_path: pathStr, path: pathStr } : {}
        );
        ctx.appendAssistantText("\n\n" + line + "\n\n");
      }
      return;
    }
    if (item.type === "mcp_tool_call" && item.tool) {
      const line = formatToolUseForDisplay(item.tool, item.arguments ?? {});
      ctx.appendAssistantText("\n\n" + line + "\n\n");
    }
  });

  registry.set("error", (data) => {
    const raw = (data.message as string) ?? "Error.";
    const msg = normalizeCodexErrorMessage(raw, ctx);
    ctx.addMessage("system", msg);
  });
}
