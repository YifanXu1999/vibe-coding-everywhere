/**
 * Codex CLI provider configuration.
 *
 * Defines how to spawn and configure the Codex CLI binary for non-interactive
 * runs via `codex exec --json`. Supports initial run and resume-by-session-id.
 */
export const codexConfig = {
  binary: "codex",
  buildArgs: (prompt, opts) => {
    const base = ["exec"];
    if (opts.useContinue && opts.sessionId) {
      base.push("resume", opts.sessionId);
    } else if (opts.useContinue && !opts.sessionId) {
      base.push("resume", "--last");
    }
    base.push("--json");
    if (opts.model) base.push("--model", opts.model);
    if (opts.codexProfile) base.push("--profile", opts.codexProfile);
    if (opts.modelInstructionsFile) {
      const arg = opts.modelInstructionsFile.includes(" ")
        ? `model_instructions_file="${opts.modelInstructionsFile.replace(/"/g, '\\"')}"`
        : `model_instructions_file=${opts.modelInstructionsFile}`;
      base.push("-c", arg);
    }
    if (opts.fullAuto === true) base.push("--full-auto");
    else if (opts.yolo === true && !opts.askForApproval) base.push("--dangerously-bypass-approvals-and-sandbox");
    else if (opts.askForApproval) base.push("--config", `approval_policy=${opts.askForApproval}`);
    if (opts.skipGitRepoCheck === true) base.push("--skip-git-repo-check");
    // Codex: system prompt only via profile (--profile or -c model_instructions_file). Do not prepend system prompt to the query.
    base.push(prompt);
    return base;
  },
  notFoundMessage:
    "codex not found. Install Codex CLI (npm i -g @openai/codex) and ensure it is in PATH.",
};
