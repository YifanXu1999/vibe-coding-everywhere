import type { EventContext, EventHandler } from "../types";
import { formatToolUseForDisplay } from "../types";

/**
 * Register Gemini CLI-specific event handlers into the given registry.
 *
 * Gemini sends these event types:
 * - "init"    → session start (session_id, model, cwd)
 * - "message" → assistant content (role: "model", parts/content)
 */
export function registerGeminiHandlers(
  registry: Map<string, EventHandler>,
  ctx: EventContext
): void {
  /** Gemini CLI sends "init" instead of "system" for session start. */
  registry.set("init", (data) => {
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

  /**
   * Gemini CLI sends "message" for assistant content.
   * Handles two formats:
   *  1. Direct string content with optional delta flag:
   *     {"type":"message","role":"assistant","content":"text...","delta":true}
   *  2. Array content (parts/content) similar to Claude:
   *     {"type":"message","role":"model","message":{"content":[{type:"text",text:"..."}]}}
   */
  registry.set("message", (data) => {
    const role = data.role as string | undefined;
    // Skip user messages (echoed back by Gemini CLI)
    if (role === "user") return;
    // Only handle assistant/model messages
    if (role !== "assistant" && role !== "model") return;

    const isDelta = !!data.delta;
    const content = data.content;

    // Format 1: Direct string content (Gemini streaming delta / full message)
    if (typeof content === "string") {
      if (!content) return;
      if (isDelta) {
        // Delta chunk: append directly
        ctx.appendAssistantText(content);
      } else {
        // Full message: deduplicate against already-displayed content
        const current = ctx.getCurrentAssistantContent();
        const delta = current.length > 0 && content.startsWith(current)
          ? content.slice(current.length)
          : content;
        if (delta) ctx.appendAssistantText(delta);
      }
      return;
    }

    // Format 2: Array content (tool_use blocks, text parts, etc.)
    const msg = data.message ?? data;
    const rawContents = (msg as Record<string, unknown>).content ?? (msg as Record<string, unknown>).parts;
    const contents: Array<{ type?: string; text?: string; name?: string; input?: unknown }> =
      Array.isArray(rawContents) ? rawContents : [];

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
      const delta = current.length > 0 && full.startsWith(current) ? full.slice(current.length) : full;
      if (delta) ctx.appendAssistantText(delta);
    }
  });
}
