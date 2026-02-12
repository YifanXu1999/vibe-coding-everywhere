# UI behaviour test plan: Permissions & AskUserQuestion

Based on `workspace/claude-output.log`. Sequence fixtures for mock replay live in `__tests__/sequences/`. When the Claude session returns **permission_denials** or uses the **AskUserQuestion** tool, the mobile app shows specific UI. This document describes the behaviours and how they are covered by mock tests.

---

## 1. Permission requests / denials (tool, file access, bash)

### Backend behaviour (from log)

- Session result can include `permission_denials` when the user did not grant a permission (e.g. tool, file access, bash).
- Example from log:
  ```json
  "permission_denials":[{
    "tool_name":"AskUserQuestion",
    "tool_use_id":"...",
    "tool_input":{"questions":[...]}
  }]
  ```
- For non–AskUserQuestion denials (e.g. `Bash`, `Read` with `file_path`), the app shows **PermissionDenialBanner**.

### UI behaviour to test

| Scenario | UI | Assertions (mock tests) |
|----------|----|--------------------------|
| No denials | Banner not shown | `PermissionDenialBanner` returns `null` when `denials` is empty. |
| Single denial (e.g. Bash) | Banner with “Permission denied”, tool name, Dismiss + Accept & retry | Renders summary “Permission denied”, shows tool (e.g. “Bash”), `onDismiss` and `onAccept` called when buttons pressed. |
| Single denial with file path | Banner shows tool + path | Detail shows e.g. “Read: /workspace/secret.txt” (from `tool_input.file_path` or `tool_input.path`). |
| Multiple denials | “Permissions denied” (plural), all tools/paths | Summary “Permissions denied”; detail lists all; both actions still work. |

### Mock data used in tests

- **Tool/Bash**: `{ tool_name: "Bash", tool: "Bash" }`
- **File access**: `{ tool_name: "Read", tool_input: { file_path: "/workspace/secret.txt" } }`
- **Path**: `{ tool: "Edit", tool_input: { path: "apps/mobile/App.tsx" } }`

### Test file

- `src/components/__tests__/PermissionDenialBanner.test.tsx`

---

## 2. AskUserQuestion (user question input)

### Backend behaviour (from log)

- Claude can send an **AskUserQuestion** tool call with `tool_use_id`, `tool_input.questions` (array of `{ header, question?, options: [{ label, description? }], multiSelect? }`).
- If the client cannot answer (e.g. “Answer questions?” error in log), the session may return the same as a **permission_denial**; the app then turns it into a **pending AskUserQuestion** and shows **AskQuestionModal**.

### UI behaviour to test

| Scenario | UI | Assertions (mock tests) |
|----------|----|--------------------------|
| No pending question | Modal not shown | `AskQuestionModal` returns `null` when `pending` is null or has no questions. |
| Single question (e.g. “What should the Python file do?”) | Modal “Please choose”, header, question text, list of options | Renders title, header, question, all option labels (and descriptions if present). |
| Multiple questions | Multiple blocks (e.g. Purpose + Style) | All headers and options visible. |
| Single-select | One option selectable per question; Confirm disabled until at least one selected | Confirm does not call `onSubmit` with no selection; after selecting one, Confirm calls `onSubmit` with `[{ header, selected: [label] }]`. |
| Multi-select | Multiple options selectable | `onSubmit` receives `selected` array with multiple labels. |
| Cancel | Modal can be closed without submitting | `onCancel` called when Cancel pressed; `onSubmit` not called. |
| Confirm | Submits selected answers | `onSubmit(answers)` with one entry per question; each `selected` array matches chosen options. |

### Mock data used in tests

- **Single question**: one `AskUserQuestionItem` with header “Purpose”, question “What should the Python file do or contain?”, four options (Script template, Class template, Flask/FastAPI app, Utility functions), `multiSelect: false`.
- **Two questions**: e.g. Purpose + Style (landing page), each single-select.
- **Multi-select**: one question with `multiSelect: true` and several options.

### Test file

- `src/components/__tests__/AskQuestionModal.test.tsx`

---

## Running the tests

From repo root (or `apps/mobile`):

```bash
cd apps/mobile
npm install
npm test
```

Watch mode:

```bash
npm run test:watch
```

---

## Testing on device / simulator (UI preview)

In **development** (`__DEV__`), you can open a **UI test screen** to see the permission banner and Ask question modal with mock data on the real app:

1. Start the app (e.g. `npm run dev:mobile:funnel` from repo root, or `npx expo start` in `apps/mobile`).
2. On the main chat screen, **long-press** the **☰** (menu) button.
3. The **“UI test (dev)”** screen opens with two sections:
   - **PermissionDenialBanner**: tap “Show: single (Bash)”, “Show: file access (Read + path)”, or “Show: multiple denials” to display the banner; use **Dismiss** or **Accept & retry** to close.
   - **AskQuestionModal**: tap “Show: single question” or “Show: two questions” to open the modal; choose options and **Confirm** or **Cancel**.
4. Tap **“← Back to chat”** to return to the main screen.

This uses the same mock data shapes as the unit tests so you can verify layout and behaviour on a real device or simulator.

---

## Integration note

These tests are **component-level** with **mock props**: they do not connect to the real socket or backend. To test the full flow (socket event → `useSocket` state → banner/modal), you would add integration tests that:

1. Mock `io()` (e.g. with a stub that emits `output` lines containing `permission_denials` or AskUserQuestion JSON).
2. Render `App` (or a wrapper that uses `useSocket`).
3. Assert that `PermissionDenialBanner` or `AskQuestionModal` appears and that actions (Dismiss, Accept & retry, Cancel, Confirm) update state or emit the expected socket events.

The current tests give fast, deterministic coverage of the two UIs that handle permissions and user-question input as reflected in the log.
