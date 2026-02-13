/**
 * Server configuration and environment variables.
 * 
 * This module handles all server configuration including:
 * - Port configuration
 * - Workspace directory resolution (from CLI args or env vars)
 * - Claude output logging paths
 * - System prompt directory location
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Get current directory and project root for path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

/**
 * Resolve workspace directory from CLI or environment variables.
 * Priority: --workspace flag > positional arg > WORKSPACE env > WORKSPACE_CWD env > default
 * @returns {string} Absolute path to workspace directory
 */
function resolveWorkspaceCwd() {
  const args = process.argv.slice(2);
  let fromCli = null;
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    // Check for --workspace flag
    if (args[i] === "--workspace" && args[i + 1]) {
      fromCli = args[i + 1];
      break;
    }
    // Check for positional argument (first non-flag argument)
    if (!args[i].startsWith("-")) {
      fromCli = args[i];
      break;
    }
  }
  
  // Resolve final path with fallback chain
  const raw = fromCli ?? process.env.WORKSPACE ?? process.env.WORKSPACE_CWD ?? path.join(projectRoot, "workspace_for_testing");
  const resolved = path.resolve(raw);
  
  // Validate workspace path exists and is a directory
  if (!fs.existsSync(resolved)) {
    console.warn(`[workspace] Path does not exist: ${resolved}. Using server directory.`);
    return projectRoot;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    console.warn(`[workspace] Not a directory: ${resolved}. Using server directory.`);
    return projectRoot;
  }
  return resolved;
}

// Server port - can be overridden via PORT environment variable
export const PORT = process.env.PORT || 3456;

// Workspace directory where Claude operates and files are served from
export const WORKSPACE_CWD = resolveWorkspaceCwd();

// File tree refresh interval for sidebar (milliseconds)
export const SIDEBAR_REFRESH_INTERVAL_MS = parseInt(process.env.SIDEBAR_REFRESH_INTERVAL_MS || "3000", 10) || 3000;

// Default Claude permission mode (bypassPermissions, acceptPermissions, etc.)
export const DEFAULT_PERMISSION_MODE = process.env.DEFAULT_PERMISSION_MODE || "bypassPermissions";

/**
 * Log directory for Claude output.
 * Uses CLAUDE_OUTPUT_LOG env var if set, otherwise defaults to <project-root>/logs
 */
const CLAUDE_LOG_DIR = process.env.CLAUDE_OUTPUT_LOG
  ? path.resolve(process.env.CLAUDE_OUTPUT_LOG)
  : path.join(projectRoot, "logs");

/**
 * Generate a unique log file path with timestamp.
 * Creates a new log file for each server restart.
 * @returns {string} Path to log file
 */
function getClaudeLogPath() {
  let dir = path.join(projectRoot, "logs");
  try {
    const stat = fs.statSync(CLAUDE_LOG_DIR);
    dir = stat.isDirectory() ? CLAUDE_LOG_DIR : path.dirname(CLAUDE_LOG_DIR);
  } catch {
    // If log dir doesn't exist, use default logs directory
    dir = path.isAbsolute(CLAUDE_LOG_DIR) ? path.dirname(CLAUDE_LOG_DIR) : path.join(projectRoot, "logs");
  }
  // Generate timestamp for unique filename (YYYY-MM-DDTHH-MM-SS)
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(dir, `claude-output-${ts}.log`);
}

/** Path to write Claude output log. One file per server run, with startup timestamp. */
export const CLAUDE_OUTPUT_LOG = getClaudeLogPath();

/** Directory for system prompt files (prompts/). Loaded and sent to Claude on each session. */
export const PROMPTS_DIR = path.join(projectRoot, "prompts");

// Export project paths for use in other modules
export { projectRoot, __dirname };
