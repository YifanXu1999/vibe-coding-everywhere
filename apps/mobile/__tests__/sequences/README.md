# Claude output log sequences (test fixtures)

Split from `workspace/claude-output.log`. Each file is one **session** (from "Claude session started" to "Session ended" or end of file). Used for mock replay and UI testing.

| File | Lines (original) | Definition |
|------|------------------|------------|
| **ask-single-python-purpose.log** | 2–10 | Single AskUserQuestion (Python file purpose); result has `permission_denials`. |
| **ask-single-error-fallback.log** | 12–19 | AskUserQuestion → tool_result error → assistant fallback text → result with permission_denials. |
| **ask-two-questions-purpose-style.log** | 35–43 | Two questions AskUserQuestion (landing page: Purpose + Style); result has permission_denials with 2 questions. |

**Replay one sequence (from project root):**

```bash
MOCK_CLAUDE=1 MOCK_CLAUDE_LOG=apps/mobile/__tests__/sequences/ask-single-python-purpose.log npm start
```
