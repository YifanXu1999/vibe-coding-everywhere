import type { EventContext, EventHandler } from "../types";
import { formatToolUseForDisplay } from "../types";

/**
 * Register Claude CLI-specific event handlers into the given registry.
 *
 * Claude sends these event types:
 * - "system"       → session start (session_id, model, cwd)
 * - "assistant"    → assistant content (text, tool_use)
 * - "stream_event" → content_block_delta streaming
 */
export function registerClaudeHandlers(
  registry: Map<string, EventHandler>,
  ctx: EventContext
): void {
  /** Claude CLI sends "system" at session start. */
  registry.set("system", (data) => {
    const info: string[] = [];
    if (data.session_id != null && data.session_id !== "") {
      const id = String(data.session_id);
      info.push(`Session ID: ${id}`);
      ctx.setSessionId?.(id);
    }
    if (data.model) {
      ctx.setModelName(String(data.model));
      info.push(`Model: ${data.model}`);
    }
    if (data.cwd) info.push(`Working Directory: ${data.cwd}`);
    if (info.length) console.log("[session]", info.join("\n"));
  });

  /** Claude CLI sends "assistant" for assistant content. */
  registry.set("assistant", (data) => {
    const contents = (data.message as { content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }> })?.content ?? [];
    // Append human-readable lines for tool_use so the UI shows what Claude is doing. Start on a new line.
    for (const c of contents) {
      if (c.type === "tool_use" && c.name) {
        const line = formatToolUseForDisplay(c.name, c.input);
        ctx.appendAssistantText("\n\n" + line + "\n\n");
      }
    }
    const full = contents
      .filter((c) => c.type === "text")
      .map((c) => (c as { text?: string }).text ?? "")
      .join("");
    if (full) {
      const current = ctx.getCurrentAssistantContent();
      // Only append delta so we don't re-display full text when a final "assistant" event arrives at stream end.
      const delta = current.length > 0 && full.startsWith(current) ? full.slice(current.length) : full;
      if (delta) ctx.appendAssistantText(delta);
    }
  });

  /** Handle Claude's stream_event for content_block_delta. */
  registry.set("stream_event", (data) => {
    const ev = data.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (ev?.type === "content_block_delta") {
      const text = ev.delta && typeof (ev.delta as { text?: string }).text === "string" ? (ev.delta as { text: string }).text : "";
      if (text) ctx.appendAssistantText(text);
    }
  });
}
