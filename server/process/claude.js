/**
 * Claude CLI provider configuration.
 *
 * Defines how to spawn and configure the Claude CLI binary,
 * including argument building for permissions, tools, and system prompts.
 */
export const claudeConfig = {
  binary: "claude",
  buildArgs: (prompt, opts) => [
    "--output-format",
    "stream-json",
    "--verbose",
    ...(opts.model ? ["--model", opts.model] : []),
    ...(opts.appendSystemPrompt ? ["--append-system-prompt", opts.appendSystemPrompt] : []),
    ...(opts.useContinue ? ["-c"] : []),
    ...(opts.permissionMode ? ["--permission-mode", opts.permissionMode] : []),
    ...(Array.isArray(opts.allowedTools) && opts.allowedTools.length > 0
      ? ["--allowedTools", ...opts.allowedTools]
      : []),
    "-p",
    prompt,
  ],
  notFoundMessage:
    "claude not found. Install Claude Code CLI and ensure it is in PATH.",
};
