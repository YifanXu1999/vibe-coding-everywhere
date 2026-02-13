/**
 * Formats the access-restriction system prompt for chat from
 * prompts/access-restriction/1.chat-access-restriction-prompt.md.
 * Use as (or as part of) the system prompt so the model only operates inside the workspace.
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER_WORKSPACE = "{{WORKSPACE_PATH}}";
const PLACEHOLDER_PARENT = "{{PARENT_PATH}}";

const DEFAULT_PROMPT_PATH = path.join(__dirname, "1.chat-access-restriction-prompt.md");

/**
 * Normalize workspace path (ensure one trailing slash for display).
 * @param {string} workspacePath
 * @returns {{ workspace: string, parent: string }}
 */
function normalizePaths(workspacePath) {
  if (!workspacePath || typeof workspacePath !== "string") {
    return { workspace: "", parent: "" };
  }
  const normalized = path.resolve(workspacePath).replace(/\\/g, "/");
  const workspace = normalized.endsWith("/") ? normalized : normalized + "/";
  const parent = path.dirname(normalized).replace(/\\/g, "/");
  return { workspace, parent };
}

/**
 * Extract the system instructions from markdown (content after the first "---").
 * @param {string} content
 * @returns {string}
 */
export function extractInstructions(content) {
  if (!content || typeof content !== "string") return "";
  const trimmed = content.trim();
  const sep = "---";
  const idx = trimmed.indexOf(sep);
  if (idx === -1) return trimmed;
  const after = trimmed.slice(idx + sep.length).trim();
  return after.startsWith("\n") ? after.slice(1).trim() : after;
}

/**
 * Replace path placeholders in content with actual workspace/parent paths.
 * @param {string} content
 * @param {string} _workspacePath
 * @param {{ workspace: string, parent: string }} paths
 * @returns {string}
 */
function replacePaths(content, _workspacePath, paths) {
  let out = content;
  if (paths.workspace) {
    out = out.replace(PLACEHOLDER_WORKSPACE, paths.workspace);
    out = out.replace(/Only access files and directories within: `[^`]*`/, "Only access files and directories within: `" + paths.workspace + "`");
    out = out.replace(/Only access files and directories within: ([^\n`]+)(?=\s|$)/, "Only access files and directories within: `" + paths.workspace + "`");
  }
  if (paths.parent) {
    out = out.replace(PLACEHOLDER_PARENT, paths.parent);
    out = out.replace(
      /\(e\.g\. `\.\.`, `\.\.\/`, `[^`]*`\)/,
      "(e.g. `..`, `../`, `" + paths.parent + "`)"
    );
  }
  return out;
}

/**
 * Get the formatted access-restriction system prompt.
 *
 * @param {string} workspacePath - Absolute path to the workspace directory (e.g. WORKSPACE_CWD).
 * @param {{ promptFilePath?: string, promptContent?: string }} [options] - promptFilePath to load from file, or promptContent string. Defaults to 1.chat-access-restriction-prompt.md next to this module.
 * @returns {string} Formatted prompt (instructions only, with paths substituted).
 */
export function getFormattedAccessRestrictionPrompt(workspacePath, options = {}) {
  const paths = normalizePaths(workspacePath);
  let content = "";

  if (options.promptContent != null && typeof options.promptContent === "string") {
    content = options.promptContent;
  } else {
    const filePath = options.promptFilePath && typeof options.promptFilePath === "string"
      ? options.promptFilePath
      : DEFAULT_PROMPT_PATH;
    try {
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, "utf8");
      }
    } catch (err) {
      console.warn("[formatAccessRestrictionPrompt] Failed to read", filePath, err.message);
    }
  }

  if (!content.trim()) return "";
  const instructions = extractInstructions(content);
  return replacePaths(instructions, workspacePath, paths).trim();
}

export { normalizePaths };
