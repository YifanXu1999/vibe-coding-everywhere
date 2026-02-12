# Claude output log sequences (test fixtures)

Split from `workspace/claude-output.log`. Each file is one **session** (from "Claude session started" to "Session ended" or end of file). Used for mock replay and UI testing.

| File | Lines (original) | Definition |
|------|------------------|------------|
| **ask-single-python-purpose.log** | 2–10 | Single AskUserQuestion (Python file purpose); result has `permission_denials`. |
| **ask-single-error-fallback.log** | 12–19 | AskUserQuestion → tool_result error → assistant fallback text → result with permission_denials. |
| **assistant-text-only.log** | 21–26 | Assistant text only (no tool_use); result with empty `permission_denials`. |
| **assistant-text-only-2.log** | 28–33 | Assistant text only; result with empty permission_denials. |
| **ask-two-questions-purpose-style.log** | 35–43 | Two questions AskUserQuestion (landing page: Purpose + Style); result has permission_denials with 2 questions. |
| **explore-then-ask-page-type-goal.log** | 45–106 | Task/Explore agent, Bash/Read tools, then AskUserQuestion (Page Type + Goal), TodoWrite, Read theme, etc. No "Session ended" in original log. |

**Replay one sequence (from project root):**

```bash
MOCK_CLAUDE=1 MOCK_CLAUDE_LOG=apps/mobile/__tests__/sequences/ask-single-python-purpose.log npm start
```
