# 系统性调试：item/commandExecution/requestApproval 与 UI 不显示

## 问题描述

- **已验证**：直接用 app-server 协议探测到原生事件 `item/commandExecution/requestApproval`
- **已验证**：`approvalPolicy=untrusted` 时确实会触发该请求（非 exec 那种 "approvals disabled"）
- **现象**：UI 上不显示 approval 弹窗，例如 `command render abc.html`

## 两条完全独立的执行路径

### 路径 A：Codex 直接执行（会触发 requestApproval）

```
Codex app-server (Bash tool 执行命令)
  → item/commandExecution/requestApproval
  → server/process/index.js handleCodexAppServerMessage
  → toCodexAskUserQuestionPayload → AskUserQuestion
  → socket.emit("output", JSON.stringify(askPayload) + "\n")
  → client socket.on("output")
  → JSON.parse + isProviderStream(parsed) [含 isAskUserQuestionPayload]
  → createEventDispatcher → setPendingAskQuestion
  → AskQuestionModal 显示
```

### 路径 B：用户点击 Run（**不经过** requestApproval）

```
AI 输出 bash 代码块 或 "Run the following command for render: ..."
  → MessageBubble 渲染 Run 按钮
  → 用户点击 Run
  → runCommandInNewTerminal(command)
  → socket.emit("run-render-command", { command, url })
  → server/socket/index.js handleCommand
  → spawn() 直接执行，**无任何 approval 检查**
```

**关键结论**：`run-render-command` 完全绕过 Codex 流程，不会触发 `item/commandExecution/requestApproval`。

## 调试检查点

### 1. 确认是路径 A 还是路径 B

- 若 Codex **实际通过 Bash 工具执行**命令 → 走路径 A，应有 requestApproval
- 若 AI 仅**输出文本**（含 run bar 或 bash block），用户点击 Run → 走路径 B，无 requestApproval

### 2. 路径 A 调试（requestApproval → AskQuestionModal）

在以下位置添加 `console.log`：

| 位置 | 检查内容 |
|------|----------|
| `server/process/index.js:517` | `handleCodexAppServerMessage` 收到 `item/commandExecution/requestApproval` 后，`askPayload` 是否生成并 emit |
| `apps/mobile/.../hooks.ts:310` | `socket.on("output")` 内，`parsed` 是否成功解析为 AskUserQuestion |
| `apps/mobile/.../hooks.ts:311` | `isProviderStream(parsed)` 是否为 true |
| `apps/mobile/.../eventDispatcher.ts:149` | `isAskUserQuestionPayload(data)` 后是否进入 `setPendingAskQuestion` |
| `AskQuestionModal` | `pending` 是否有值且 questions 非空 |

### 3. AskUserQuestion 载荷格式

server 发出的格式（来自 `toCodexAskUserQuestionPayload`）：

```json
{
  "tool_name": "AskUserQuestion",
  "tool_use_id": "<reqId>",
  "tool_input": {
    "questions": [{
      "header": "Command approval",
      "question": "Allow Codex to run this command?\n<command>\nReason: ...",
      "options": [
        { "label": "Approve", "description": "Run this command." },
        { "label": "Deny", "description": "Do not run this command." }
      ],
      "multiSelect": false
    }]
  }
}
```

client `isAskUserQuestionPayload` 校验：`tool_name === "AskUserQuestion"` 且 `tool_input.questions` 为非空数组。

### 4. 可能的根因

- **路径混淆**：用户以为 "render abc.html" 会走 Codex 执行，实际是 Run 按钮走 run-render-command
- **output 分片**：JSON 被 `\n` 分到多个 chunk，某行不完整导致 `JSON.parse` 失败，落入 `appendAssistantText` 作为纯文本
- **ANSI/前缀污染**：PTY 注入 `<u` 等，若 `clean.indexOf("{")` 定位错误，可能解析失败

## 已实施的修复与调试

### 1. run-render-command 支持 approval（已实现）

- 文件：`apps/mobile/App.tsx`
- `handleRunCommandWithApproval`：当 `permissionModeUI === "always_ask"` 且 `provider === "codex"` 时，点击 Run 前弹出 Alert 确认，用户 Approve 后才 emit `run-render-command`
- MessageBubble 的 `onRunBashCommand` 改为使用 `handleRunCommandWithApproval`

### 2. 路径 A 调试日志（已添加）

| 位置 | 日志内容 |
|------|----------|
| `server/process/index.js` | `[codex] emitting AskUserQuestion for <method>` |
| `apps/mobile/.../hooks.ts` (socket output) | `[socket/output] AskUserQuestion line received <tool_use_id>` (仅 __DEV__) |
| `apps/mobile/.../eventDispatcher.ts` | `[eventDispatcher] AskUserQuestion received` (仅 __DEV__) |

重现时观察控制台：若 server 有 log 但 client 无 `[socket/output]`，说明 output 未到达或解析失败；若 client 有 `[socket/output]` 但无 `[eventDispatcher]`，说明 `isProviderStream` 或 dispatcher 逻辑有问题。
