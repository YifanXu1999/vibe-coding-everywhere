/**
 * Formats the access-restriction system prompt for chat.
 * Use this as (or as part of) the system prompt so the model only operates inside the workspace.
 *
 * Usage:
 *   const { getFormattedAccessRestrictionPrompt } = require('./workspace/formatAccessRestrictionPrompt.js');
 *   const prompt = getFormattedAccessRestrictionPrompt(workspacePath, { promptFilePath: '...' });
 *   // or with content string:
 *   const prompt = getFormattedAccessRestrictionPrompt(workspacePath, { promptContent: rawContent });
 */

const path = require("path");
const fs = require("fs");

const PLACEHOLDER_WORKSPACE = "{{WORKSPACE_PATH}}";
const PLACEHOLDER_PARENT = "{{PARENT_PATH}}";

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
function extractInstructions(content) {
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
 * Supports {{WORKSPACE_PATH}} and {{PARENT_PATH}}, or replaces common literal patterns.
 * @param {string} content
 * @param {string} workspacePath
 * @param {{ workspace: string, parent: string }} paths
 * @returns {string}
 */
function replacePaths(content, workspacePath, paths) {
  let out = content;
  if (paths.workspace) {
    out = out.replace(PLACEHOLDER_WORKSPACE, paths.workspace);
    // Replace literal "within: `...`" pattern (path in backticks)
    out = out.replace(/Only access files and directories within: `[^`]*`/, (m) =>
      m.replace(/`[^`]*`$/, "`" + paths.workspace + "`")
    );
    // Replace "paths that start with the workspace path above" is already generic
  }
  if (paths.parent) {
    out = out.replace(PLACEHOLDER_PARENT, paths.parent);
    // Replace forbidden parent example (e.g. `..`, `../`, `/path/to/parent`)
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
 * @param {{ promptFilePath?: string, promptContent?: string }} options - Either promptFilePath to load from file, or promptContent string. If neither, returns empty string.
 * @returns {string} Formatted prompt (instructions only, with paths substituted).
 */
function getFormattedAccessRestrictionPrompt(workspacePath, options = {}) {
  const paths = normalizePaths(workspacePath);
  let content = "";

  if (options.promptContent != null && typeof options.promptContent === "string") {
    content = options.promptContent;
  } else if (options.promptFilePath && typeof options.promptFilePath === "string") {
    try {
      if (fs.existsSync(options.promptFilePath)) {
        content = fs.readFileSync(options.promptFilePath, "utf8");
      }
    } catch (err) {
      console.warn("[formatAccessRestrictionPrompt] Failed to read", options.promptFilePath, err.message);
    }
  }

  if (!content.trim()) return "";
  const instructions = extractInstructions(content);
  return replacePaths(instructions, workspacePath, paths).trim();
}

module.exports = {
  getFormattedAccessRestrictionPrompt,
  extractInstructions,
  normalizePaths,
};
