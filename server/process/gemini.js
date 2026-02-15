/**
 * Gemini CLI provider configuration.
 *
 * Defines how to spawn and configure the Gemini CLI binary,
 * including argument building for approval mode.
 */
export const geminiConfig = {
  binary: "gemini",
  buildArgs: (prompt, opts) => [
    "--output-format",
    "stream-json",
    ...(opts.model ? ["--model", opts.model] : []),
    ...(opts.useContinue ? ["--resume"] : []),
    ...(opts.approvalMode ? ["--approval-mode", opts.approvalMode] : []),
    "-p",
    prompt,
  ],
  notFoundMessage:
    "gemini not found. Install Gemini CLI (npm i -g @google/gemini-cli) and ensure it is in PATH.",
};
