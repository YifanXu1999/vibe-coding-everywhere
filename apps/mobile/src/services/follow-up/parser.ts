/**
 * Parser for follow-up prompt files (prompts/follow-up/*.md).
 * Extracts frontmatter (## name, ## description, ## query) and body (system prompt).
 */

export type ParsedFollowUp = {
  name: string;
  description: string;
  queryTemplate: string;
  systemPrompt: string;
};

const FRONTMATTER_KEY_REGEX = /^##\s+(\w+)\s*:\s*(.*)$/;

/**
 * Parse a follow-up markdown file.
 * Frontmatter uses ## key: value format. Body is everything after frontmatter (ignored).
 * @param content - Raw file content
 * @returns Parsed follow-up or null if invalid
 */
export function parseFollowUpFile(content: string): ParsedFollowUp | null {
  if (!content || typeof content !== "string") return null;

  const lines = content.split(/\r?\n/);
  const frontmatter: Record<string, string> = {};
  let bodyStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip opening --- if present
    if (i === 0 && line.trim() === "---") continue;

    const match = line.match(FRONTMATTER_KEY_REGEX);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const value = (match[2] ?? "").trim();
      frontmatter[key] = value;
    } else if (bodyStartIndex === -1 && line.trim() !== "") {
      // First non-empty, non-frontmatter line starts the body
      bodyStartIndex = i;
      break;
    }
  }

  const name = frontmatter.name ?? "";
  const description = frontmatter.description ?? "";
  const queryTemplate = frontmatter.query ?? "";

  if (!name || !queryTemplate) return null;

  // Body: everything after frontmatter (ignore frontmatter in system prompt)
  const bodyStart = bodyStartIndex >= 0 ? bodyStartIndex : lines.length;
  const systemPrompt = lines.slice(bodyStart).join("\n").trim();

  return {
    name,
    description,
    queryTemplate,
    systemPrompt,
  };
}

/**
 * Build the user query by replacing {SELECTED_CONTENT} in the template with the selected content.
 */
export function buildQuery(template: string, selectedContent: string): string {
  return template.replace(/\{SELECTED_CONTENT\}/g, selectedContent ?? "");
}
