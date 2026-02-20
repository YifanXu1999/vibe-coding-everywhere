/**
 * Prompt loading and management.
 */
import fs from "fs";
import path from "path";
import { PROMPTS_DIR, getWorkspaceCwd } from "../config/index.js";
import { getPreviewHost } from "../utils/index.js";

const SYSTEM_PROMPT_FILE = "full-stack-developer.md";
const PLACEHOLDER_WORKSPACE = "{{WORKSPACE_PATH}}";
const PLACEHOLDER_PARENT = "{{PARENT_PATH}}";
const PLACEHOLDER_PREVIEW_HOST = "{{PREVIEW_HOST}}";

/**
 * Load a system prompt from prompts/<name>.txt.
 * @param {string} name - Filename or path without extension (e.g. "page-render", "output/command")
 * @returns {string} Trimmed file content, or "" if file missing/unreadable
 */
export function loadPrompt(name) {
  if (!name || typeof name !== "string") return "";
  const base = name.replace(/\.txt$/, "");
  const filePath = path.join(PROMPTS_DIR, `${base}.txt`);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8").trim();
    }
  } catch (err) {
    console.warn("[prompts] Failed to load", filePath, err.message);
  }
  return "";
}

/** Load system prompt from prompts/system-prompt.md and substitute {{WORKSPACE_PATH}}, {{PARENT_PATH}}, {{PREVIEW_HOST}}. */
export function getChatSystemPrompt() {
  const filePath = path.join(PROMPTS_DIR, SYSTEM_PROMPT_FILE);
  let prompt = "";
  try {
    if (fs.existsSync(filePath)) {
      prompt = fs.readFileSync(filePath, "utf8").trim();
    }
  } catch (err) {
    console.warn("[prompts] Failed to read", filePath, err.message);
  }
  const workspacePath = getWorkspaceCwd() || "";
  const normalized = workspacePath ? path.resolve(workspacePath).replace(/\\/g, "/") : "";
  const workspace = normalized.endsWith("/") ? normalized : normalized ? normalized + "/" : "";
  const parent = normalized ? path.dirname(normalized).replace(/\\/g, "/") : "";
  prompt = prompt.split(PLACEHOLDER_WORKSPACE).join(workspace);
  prompt = prompt.split(PLACEHOLDER_PARENT).join(parent);
  prompt = prompt.split(PLACEHOLDER_PREVIEW_HOST).join(getPreviewHost());
  return prompt;
}

