# Claude Code CLI Reference

> **Personal daily reference for working with Claude Code in the terminal.**

---

## Quick Start

```

# One-shot query (no session, great for scripts)
claude -p "what does this function do?"
```

---

## Core Commands

| **What it does**                     | **Example**                      |
| ------------------------------------------ | -------------------------------------- |
| **One-shot query, then exit**        | `claude -p "summarize this file"`    |
| **Continue last session, then exit** | `claude -c -p "fix the type errors"` |
| **Resume a specific session by ID**  | `claude -r "abc123" "finish the PR"` |

---

## Everyday Flags

### Session & Navigation

```
# Continue last session
claude --continue
claude -c

# Resume a specific past session (interactive picker if no ID given)
claude --resume
claude -r "abc123" "pick up where we left off"

# Fork a session — creates a new ID instead of overwriting
claude --resume abc123 --fork-session

# Set a custom session UUID
claude --session-id "550e8400-e29b-41d4-a716-446655440000"
```

### Model Selection

```
# Use Sonnet (fast, everyday tasks)
claude --model sonnet

# Use Opus (complex reasoning, architecture)
claude --model opus

# Use a specific full model string
claude --model claude-sonnet-4-5-20250929

# Fallback if default model is overloaded (print mode only)
claude -p --fallback-model sonnet "refactor this module"
```

### Output & Printing

```
# Plain text output
claude -p "explain this code" --output-format text

# JSON output — great for piping into scripts
claude -p "list all TODO comments" --output-format json

# Streaming JSON (line-by-line events)
claude -p "analyze this log" --output-format stream-json

# Include partial streaming events
claude -p --output-format stream-json --include-partial-messages "query"
```

### Working Directories

```
# Give Claude access to additional directories
claude --add-dir ../shared-lib ../utils

# Useful when working in a monorepo
claude --add-dir ../packages/core ../packages/api
```

### Tool Permissions

```
# Allow specific tools without prompting
claude --allowedTools "Read" "Bash(git log:*)" "Bash(git diff:*)"

# Block specific tools
claude --disallowedTools "Bash" "Edit"

# Specify exact tools available (comma-separated)
claude -p --tools "Bash,Edit,Read" "fix the failing tests"

# Disable all tools
claude -p --tools "" "explain this code"

# Skip all permission prompts — use in trusted/local environments only!
claude --dangerously-skip-permissions
```

### System Prompt Customisation

```
# Add instructions on top of the default prompt (recommended)
claude --append-system-prompt "Always write TypeScript with strict types and JSDoc"

# Replace the entire system prompt
claude --system-prompt "You are a senior Go engineer. Only write idiomatic Go."

# Load system prompt from a file (print mode only)
claude -p --system-prompt-file ./prompts/reviewer.txt "review this PR"
```

> **Tip:** Prefer `--append-system-prompt` for most tasks — it adds your instructions while keeping Claude Code's built-in capabilities intact.

```
# Pipe a file into Claude
cat server.log | claude -p "summarise the errors"

# Pipe git diff for a review
git diff HEAD~1 | claude -p "write a commit message for this diff"

# Combine with jq for structured output
claude -p "list all exported functions as JSON" --output-format json | jq '.functions'

# Limit agentic turns to keep scripts predictable
claude -p --max-turns 5 "refactor auth.ts and run the tests"
```

| **Field** | **Required** | **Description**                                                  |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `description` | **✅**       | **When Claude should invoke this subagent**                      |
| `prompt`      | **✅**       | **The subagent's system prompt**                                 |
| `tools`       | **❌**       | **Tool list (e.g.**`["Read","Bash"]`). Inherits all if omitted |
| `model`       | **❌**       | `sonnet`,`opus`, or `haiku`. Defaults to project setting         |

---

## Permission Modes



### 1. `default` (Normal)

Prompts you for approval on the first use of each tool per session. The safest starting point — you stay in control of every meaningful action.

### 2. `acceptEdits`

Auto-approves file read/write operations so Claude can edit code without prompting. Other tools (like Bash commands) still require normal approval. Good for fast iteration when you trust Claude's edits.

### 3. `plan`

Claude can analyze your code and propose a plan, but  **cannot make any changes or execute commands** . Read-only mode — ideal for exploring unfamiliar code or reviewing before committing to changes.

### 4. `dontAsk`

Auto-denies all tool usage **unless** a tool is explicitly pre-approved via `/permissions` or your `allow` rules. Claude won't prompt — anything not on the allowlist is silently denied. Useful for tightly controlled automation.

### 5. `bypassPermissions`

Skips **all** permission checks. Claude executes any tool without prompting. Equivalent to the `--dangerously-skip-permissions` CLI flag. **Only use in isolated environments** like containers or VMs — administrators can disable this entirely via managed settings.




---

## Useful Combos

```
# Review a file with Opus for deep analysis
claude --model opus "thoroughly review src/auth.ts for security issues"

# Automated security scan, JSON output, limited turns
claude -p --tools "Read,Grep,Glob" --max-turns 3 --output-format json \
  "scan for hardcoded secrets" > security-report.json

# Continue last session with verbose logging for debugging
claude -c --verbose

# Use a custom prompt file + extra working directories
claude --system-prompt-file ./prompts/refactor.txt --add-dir ../shared "refactor the data layer"
```
