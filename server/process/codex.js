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
    if (opts.fullAuto === true) base.push("--full-auto");
    else if (opts.yolo === true) base.push("--dangerously-bypass-approvals-and-sandbox");
    else if (opts.askForApproval) base.push("--ask-for-approval", opts.askForApproval);
    if (opts.skipGitRepoCheck === true) base.push("--skip-git-repo-check");
    base.push(prompt);
    return base;
  },
  notFoundMessage:
    "codex not found. Install Codex CLI (npm i -g @openai/codex) and ensure it is in PATH.",
};
