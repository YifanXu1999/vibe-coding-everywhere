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

/** Known bash/zsh system messages to hide from terminal output display. */
const BASH_NOISE_PATTERNS = [
  /^bash:\s*no job control in this shell\s*$/i,
  /^The default interactive shell is now zsh\.\s*To update your account to use zsh,\s*please run\s+[`']chsh\s+-s\s+\/bin\/zsh[`']\.?\s*$/i,
  /^The default interactive shell is now zsh\.\s*$/i,
  /^To update your account to use zsh,\s*please run\s+[`']chsh\s+-s\s+\/bin\/zsh[`']\.?\s*$/i,
  /^For more details,\s*please visit\s+https:\/\/support\.apple\.com\/kb\/HT208050\.?\s*$/i,
  /^bash-\d+\.\d+\$?\s*$/,
];

/**
 * Filter out known bash shell system messages from terminal output.
 * Returns the filtered string, or empty string if the entire chunk should be hidden.
 */
export function filterBashNoise(chunk: string): string {
  if (!chunk || typeof chunk !== "string") return "";
  const plain = stripAnsi(chunk);
  const lines = plain.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep blank lines
    return !BASH_NOISE_PATTERNS.some((p) => p.test(trimmed));
  });
  const result = kept.join("\n");
  return result.trim() ? result : "";
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

/** Payload is AskUserQuestion tool call (tool_name + tool_input.questions). */
export function isAskUserQuestionPayload(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (String(obj.tool_name ?? "") !== "AskUserQuestion") return false;
  const input = obj.tool_input as Record<string, unknown> | undefined;
  return Array.isArray(input?.questions) && (input.questions as unknown[]).length > 0;
}

/** Check if data matches known AI stream event format (works for both Claude and Gemini). */
export function isProviderStream(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  const types = [
    "system", "assistant", "result", "user", "input", "permission_request", "stream_event",
    "init", "message", "tool_use", "tool_result",
  ];
  return (
    types.includes(String(obj.type ?? "")) ||
    Array.isArray(obj.permission_denials) ||
    isAskUserQuestionPayload(obj)
  );
}

/** @deprecated Use isProviderStream */
export const isClaudeStream = isProviderStream;

export function deniedToolToAllowedPattern(toolName: string | null | undefined): string | null {
  if (!toolName || typeof toolName !== "string") return null;
  const t = toolName.trim();
  if (t === "Bash") return "Bash(*)";
  if (["Write", "Edit", "Read"].includes(t)) return t;
  return t;
}

/**
 * Known provider CLI system noise lines to suppress from chat display.
 * These are startup/diagnostic messages from Gemini/Claude CLI that should not appear in the chat UI.
 */
const PROVIDER_NOISE_PATTERNS = [
  /^Approval mode overridden/i,
  /^Loaded cached credentials/i,
  /^Project hooks disabled/i,
  /^Hook registry initialized/i,
  /^The current folder is not trusted/i,
  /^To update your account/i,
  /^For more details,?\s*please visit/i,
  /^✓\s*(Model|Session|Sandbox)/i,
  /^Using model:/i,
];

/** Returns true if the line is known CLI system noise that should be suppressed from chat display. */
export function isProviderSystemNoise(line: string): boolean {
  if (!line || typeof line !== "string") return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  return PROVIDER_NOISE_PATTERNS.some((p) => p.test(trimmed));
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
