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
    ...(opts.systemPrompt ? ["--system-prompt", opts.systemPrompt] : []),
    ...(opts.sessionId
      ? opts.useContinue
        ? ["--resume", opts.sessionId]
        : ["--session-id", opts.sessionId]
      : []),
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
