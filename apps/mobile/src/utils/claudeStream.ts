const ANSI_REGEX =
  /\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-_]|\x1B.|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export const RENDER_CMD_REGEX = /Run the following command for render:\s*"([^"]+)"/i;
export const RENDER_URL_REGEX = /URL for preview:\s*"([^"]+)"/i;
/** Message is "not verified" (need permission) — do not show verified-style run bar. */
export const NEED_PERMISSION_REGEX = /Need permission for the following commands:/i;

export function stripAnsi(value: string): string {
  if (!value) return "";
  return value.replace(ANSI_REGEX, "");
}

/** Strip trailing incomplete XML/HTML tag (e.g. "<u" from truncated "<u>" or "<url...") that appears at end of chat. */
export function stripTrailingIncompleteTag(value: string): string {
  if (!value || typeof value !== "string") return value;
  return value.replace(/\s*<\w*$/, "");
}

export function extractRenderCommandAndUrl(text: string | null | undefined): { command: string; url: string } | null {
  if (!text || typeof text !== "string") return null;
  if (NEED_PERMISSION_REGEX.test(text)) return null;
  const cmdMatch = text.match(RENDER_CMD_REGEX);
  const urlMatch = text.match(RENDER_URL_REGEX);
  if (!cmdMatch?.[1] || !urlMatch?.[1]) return null;
  return { command: cmdMatch[1].trim(), url: urlMatch[1].trim() };
}

export function isClaudeStream(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  const types = ["system", "assistant", "result", "user", "input", "permission_request"];
  return types.includes(String(obj.type ?? "")) || Array.isArray(obj.permission_denials);
}

export function deniedToolToAllowedPattern(toolName: string | null | undefined): string | null {
  if (!toolName || typeof toolName !== "string") return null;
  const t = toolName.trim();
  if (t === "Bash") return "Bash(*)";
  if (["Write", "Edit", "Read"].includes(t)) return t;
  return t;
}

export function getAllowedToolsFromDenials(denials: Array<{ tool_name?: string; tool?: string }>): string[] {
  if (!Array.isArray(denials) || !denials.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const denial of denials) {
    const pattern = deniedToolToAllowedPattern(denial.tool_name ?? denial.tool ?? "");
    if (pattern && !seen.has(pattern)) {
      seen.add(pattern);
      out.push(pattern);
    }
  }
  return out;
}
