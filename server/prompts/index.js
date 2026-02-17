/**
 * Prompt loading and management.
 */
import fs from "fs";
import path from "path";
import { PROMPTS_DIR, getWorkspaceCwd, projectRoot } from "../config/index.js";
import { getFormattedAccessRestrictionPrompt } from "../../prompts/access-restriction/formatAccessRestrictionPrompt.js";
import { getPreviewHost } from "../utils/index.js";

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

/**
 * Read content from a file in a prompt folder. Returns trimmed string or "".
 * @param {string} folderName - Subfolder name under prompts/ (e.g. "access-restriction")
 * @param {string} filename - File name (e.g. "main.txt", "command.txt")
 * @returns {string}
 */
export function readPromptFile(folderName, filename) {
  const filePath = path.join(PROMPTS_DIR, folderName, filename);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8").trim();
    }
  } catch (err) {
    console.warn("[prompts] Failed to read", filePath, err.message);
  }
  return "";
}

/**
 * List prompt files in a folder that have a numeric prefix (1., 2., ...), sorted by that number.
 * @param {string} folderName
 * @returns {{ num: number, name: string }[]}
 */
export function getOrderedPromptFilesInFolder(folderName) {
  const folderPath = path.join(PROMPTS_DIR, folderName);
  let entries = [];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch (err) {
    return [];
  }
  const numbered = entries
    .map((name) => {
      const m = name.match(/^(\d+)\.(.+)$/);
      return m ? { num: parseInt(m[1], 10), name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.num - b.num);
  return numbered;
}

/**
 * Get the "existing" body content for a prompt folder: all files with prefix 1., 2., ... in order.
 * For access-restriction, .md contents are formatted via getFormattedAccessRestrictionPrompt.
 * @param {string} folderName
 * @returns {string}
 */
export function getExistingPromptBody(folderName) {
  const ordered = getOrderedPromptFilesInFolder(folderName);
  const parts = [];
  for (const { name } of ordered) {
    let content = readPromptFile(folderName, name);
    if (!content) continue;
    if (folderName === "access-restriction" && name.endsWith(".md")) {
      content = getFormattedAccessRestrictionPrompt(getWorkspaceCwd(), { promptContent: content });
    }
    if (content) parts.push(content);
  }
  return parts.join("\n\n");
}

/**
 * Build one prompt part for a folder: main.txt content combined with existing body.
 * @param {string} folderName
 * @returns {string}
 */
export function getPromptPartForFolder(folderName) {
  const mainContent = readPromptFile(folderName, "main.txt");
  const bodyContent = getExistingPromptBody(folderName);
  const parts = [mainContent, bodyContent].filter(Boolean);
  return parts.join("\n\n");
}

/** Folder order: access-restriction first, output-enhancement last, others in between (alphabetically). */
const PROMPT_FOLDER_ORDER = ["access-restriction", "output-enhancement"];

function sortPromptFolders(folderNames) {
  const ordered = new Set(PROMPT_FOLDER_ORDER);
  const first = PROMPT_FOLDER_ORDER[0];
  const last = PROMPT_FOLDER_ORDER[PROMPT_FOLDER_ORDER.length - 1];
  const middle = folderNames.filter((n) => !ordered.has(n)).sort();
  const result = [];
  if (folderNames.includes(first)) result.push(first);
  result.push(...middle);
  if (last !== first && folderNames.includes(last)) result.push(last);
  return result;
}

/** Placeholder in prompts replaced with dynamic preview host (Tailscale or PREVIEW_HOST). */
const PREVIEW_HOST_PLACEHOLDER = "{{PREVIEW_HOST}}";

/** Combined system prompt: for each subfolder of prompts/, main.txt + existing body (1., 2., ...), then all concatenated. Order: access-restriction -> ... -> output-enhancement. Dynamic placeholders (e.g. {{PREVIEW_HOST}}) are substituted. */
export function getChatSystemPrompt() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROMPTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
    dirs = sortPromptFolders(dirs);
  } catch (err) {
    console.warn("[prompts] Failed to list", PROMPTS_DIR, err.message);
  }
  const parts = dirs.map(getPromptPartForFolder).filter(Boolean);
  let prompt = parts.join("\n\n");
  const previewHost = getPreviewHost();
  prompt = prompt.split(PREVIEW_HOST_PLACEHOLDER).join(previewHost);
  return prompt;
}

