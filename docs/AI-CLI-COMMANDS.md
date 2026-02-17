# AI CLI 命令与选项说明

本文档说明服务端如何根据客户端请求和配置，为 **Claude CLI** 与 **Gemini CLI** 构建命令行参数，以及不同场景下使用的 flags 与 options。

## 概览

- 客户端通过 Socket.IO 的 `submit-prompt` 事件发送 `prompt` 和可选选项。
- 服务端根据 `provider`（`claude`、`gemini` 或 `codex`）选择对应配置，调用 `buildArgs(prompt, options)` 生成 CLI 参数，再通过 `pty.spawn(binary, args, ...)` 启动进程。
- 工作目录固定为服务端配置的 `WORKSPACE_CWD`。

---

## Claude CLI

**二进制名：** `claude`  
**配置模块：** `server/process/claude.js`

### 始终添加的参数

| 参数 | 说明 |
|------|------|
| `--output-format stream-json` | 以 JSON 流式输出，便于解析 |
| `--verbose` | 详细日志 |
| `-p <prompt>` | 用户提示词（必填） |

### 按场景添加的参数

#### 1. 续写（Continue）

| 条件 | 添加参数 | 说明 |
|------|----------|------|
| `opts.useContinue === true` | `-c` | 表示“续写”上一次会话；服务端在**首轮对话完成后**的后续 `submit-prompt` 中自动将 `useContinue` 设为 `true`（见 `hasCompletedFirstRunRef`）。 |

**何时出现：** 用户在同一次连接中第一次发送 prompt 后，再次发送 prompt（或空 prompt 继续）时，服务端会传 `useContinue: true`，从而加上 `-c`。

#### 2. 权限模式（Permission mode）

| 条件 | 添加参数 | 说明 |
|------|----------|------|
| `opts.permissionMode` 非空 | `--permission-mode <mode>` | 控制 Claude 对权限请求（读文件、写文件、执行命令等）的行为。 |

**来源：**

- 客户端在 `submit-prompt` 的 payload 里可传 `permissionMode`。
- 若未传或为空，使用服务端环境变量 `DEFAULT_PERMISSION_MODE`（默认 `bypassPermissions`）。

**常见取值（以 Claude Code 文档为准）：**

- `default`：每种工具首次使用时提示权限（“ask once per session”）
- `acceptEdits`：自动接受编辑类权限（其他高风险操作仍可能要求确认）
- `plan`：只做分析与计划，不执行变更
- `dontAsk`：未显式允许的工具默认拒绝
- `bypassPermissions`：自动通过权限
- 其他 CLI 支持的值按官方文档为准

#### 3. 允许的工具（Allowed tools）

| 条件 | 添加参数 | 说明 |
|------|----------|------|
| `opts.allowedTools` 为非空数组 | `--allowedTools` + 若干工具名 | 限制本次会话只允许使用的工具（如 `Read`、`Write` 等）。 |

**来源：** 客户端在 `submit-prompt` 中传 `allowedTools: string[]`。常用于“权限被拒后重试”时，只放开用户同意过的工具。

#### 4. 追加系统提示（Append system prompt）

| 条件 | 添加参数 | 说明 |
|------|----------|------|
| `opts.systemPrompt` 非空 | `--system-prompt <text>` | 服务端将 `prompts/` 下各子目录拼成的系统提示（含访问限制、预览地址等）通过此参数传入。 |

**来源：** 仅当 `provider === "claude"` 时，服务端调用 `getChatSystemPrompt()` 得到内容并赋给 `systemPrompt`；Gemini 不使用此选项。

### Claude 命令示例

```bash
# 首次对话，默认权限模式，无工具限制
claude --output-format stream-json --verbose --permission-mode bypassPermissions -p "Hello"

# 续写 + 指定权限模式 + 允许 Read/Write
claude --output-format stream-json --verbose -c --permission-mode default --allowedTools Read Write -p ""

# 带自定义系统提示
claude --output-format stream-json --verbose --system-prompt "You are in workspace /path/to/project." -p "Refactor index.js"
```

---

## Gemini CLI

**二进制名：** `gemini`  
**配置模块：** `server/process/gemini.js`

### 始终添加的参数

| 参数 | 说明 |
|------|------|
| `--output-format stream-json` | 以 JSON 流式输出 |
| `-p <prompt>` | 用户提示词（必填） |

### 按场景添加的参数

#### 1. 续写（Resume）

| 条件 | 添加参数 | 说明 |
|------|----------|------|
| `opts.useContinue === true` | `--resume` | 恢复最近一次会话后继续；服务端在**首轮对话完成后**的后续 `submit-prompt` 中自动将 `useContinue` 设为 `true`。续写前会先结束当前 PTY 进程，再以 `--resume` 启动新进程，从而加载上一轮会话。 |

（Gemini CLI 无类似 Claude 的 `-c`，使用 `--resume` 恢复最近会话；会话按项目自动保存，详见官方文档。）

#### 2. 审批模式（Approval mode）

| 条件 | 添加参数 | 说明 |
|------|----------|------|
| `opts.approvalMode` 非空 | `--approval-mode <mode>` | 控制编辑/执行前的审批方式。 |

**来源：**

- 客户端在 `submit-prompt` 的 payload 里可传 `approvalMode`。
- 若未传或为空，使用服务端环境变量 `DEFAULT_GEMINI_APPROVAL_MODE`（默认 `auto_edit`）。

**常见取值：**

- `default`：默认审批行为
- `auto_edit`：自动接受编辑类操作
- `plan`：先规划再执行

（具体以 Gemini CLI 官方文档为准。）

### Gemini 命令示例

```bash
# 仅必选参数
gemini --output-format stream-json -p "Explain this code"

# 续写（恢复上一轮会话后再发新 prompt）
gemini --output-format stream-json --resume --approval-mode auto_edit -p "Refactor this function"

# 指定审批模式
gemini --output-format stream-json --approval-mode auto_edit -p "Refactor this function"
```

---

## Codex CLI

**二进制名：** `codex`  
**配置模块：** `server/process/codex.js`

使用非交互模式 `codex exec --json`，输出 JSONL 事件流。续聊优先使用首轮返回的 `thread_id` 作为 session id。

### 首次运行

| 参数 | 说明 |
|------|------|
| `exec` | 非交互执行 |
| `--json` | 输出 JSONL 事件（便于解析） |
| `-p <prompt>` 或末尾 prompt | 用户提示词（必填） |

可选：`--model`、`--ask-for-approval`、`--full-auto`、`--yolo`、`--skip-git-repo-check`。

### 续写（Resume）

| 条件 | 命令形式 | 说明 |
|------|----------|------|
| `opts.useContinue === true` 且 `opts.sessionId` 存在 | `codex exec resume <session_id> --json ... <prompt>` | 使用首轮 `thread.started` 事件中的 `thread_id` 作为 session id 续聊。 |
| `opts.useContinue === true` 且无 sessionId | `codex exec resume --last --json ... <prompt>` | 防御性回退，恢复“最近一次”会话。 |

**Session ID 来源：** 服务端在 PTY 输出中解析 `{"type":"thread.started","thread_id":"..."}`，将 `thread_id` 写入 `session_management.session_id`，后续续写时传入。

### 审批/权限映射（客户端 → Codex）

| 客户端 UI | Codex 参数 |
|------------|------------|
| YOLO | `--yolo` 或 `--dangerously-bypass-approvals-and-sandbox` |
| Always ask | `--ask-for-approval untrusted` |
| Ask once per session | `--ask-for-approval on-request` |

### Codex 命令示例

```bash
# 首次对话
codex exec --json -p "Summarize this repo"

# 续写（使用已保存的 thread_id）
codex exec resume 0199a213-81c0-7800-8aa1-bbab2a035a53 --json -p "Now add tests"

# 无 session id 时回退
codex exec resume --last --json -p "Continue"
```

---

## 客户端 payload → 服务端 options → CLI 参数 对应关系

### submit-prompt 的 payload 字段（客户端）

| 字段 | 类型 | 适用 Provider | 说明 |
|------|------|----------------|------|
| `prompt` | string | 两者 | 用户输入，必填（续写时可为空字符串） |
| `provider` | `"claude" \| "gemini" \| "codex"` | 三者 | 不传则用服务端 `DEFAULT_PROVIDER` |
| `permissionMode` | string | Claude | 传给 Claude 的 `--permission-mode` |
| `allowedTools` | string[] | Claude | 传给 Claude 的 `--allowedTools` |
| `approvalMode` | string | Gemini | 传给 Gemini 的 `--approval-mode` |
| `askForApproval` | string | Codex | 传给 Codex 的 `--ask-for-approval` |
| `fullAuto` | boolean | Codex | 传给 Codex 的 `--full-auto` |
| `yolo` | boolean | Codex | 传给 Codex 的 `--yolo` |
| `replaceRunning` | boolean | 三者 | 为 true 时先结束当前会话再起新进程 |

### 服务端 options 的构造（process/index.js）

- **Claude：**  
  `permissionMode`、`allowedTools`、`useContinue`、`systemPrompt`（来自 `getChatSystemPrompt()`）。
- **Gemini：**  
  `approvalMode`、`useContinue`（续写时加 `--resume`）；无 `permissionMode` / `allowedTools` / `systemPrompt`。
- **Codex：**  
  `useContinue`、`sessionId`（来自首轮 JSONL 的 `thread.started.thread_id`）；续写时 `codex exec resume <session_id> --json`，无 sessionId 时回退 `resume --last`。可选 `askForApproval`、`fullAuto`、`yolo`、`model`、`skipGitRepoCheck`。

### 环境变量与默认值（server/config/index.js）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEFAULT_PERMISSION_MODE` | Claude 默认权限模式 | `bypassPermissions` |
| `DEFAULT_GEMINI_APPROVAL_MODE` | Gemini 默认审批模式 | `auto_edit` |
| `DEFAULT_PROVIDER` | 未指定时的 AI 提供方 | `gemini` |

---

## 典型使用场景小结

| 场景 | Claude | Gemini | Codex |
|------|--------|--------|--------|
| 首次发送一条 prompt | `-p "..."` + 可选 `--permission-mode`、`--allowedTools`、`--system-prompt` | `-p "..."` + 可选 `--approval-mode` | `codex exec --json ... -p "..."`，可选 `--model`、`--ask-for-approval`、`--full-auto`、`--yolo` |
| 同会话内再次发送（续写） | 加上 `-c`，其余同上 | 先结束当前进程，再以 `--resume` + `-p "..."` 启动新进程 | 先结束当前进程，再以 `codex exec resume <thread_id> --json ... -p "..."` 启动；无 thread_id 时用 `resume --last` |
| 权限/审批 | 使用新的 `permissionMode` / `allowedTools` 重试 | 不涉及 permission/allowedTools | 使用 `askForApproval` / `fullAuto` / `yolo` |
| 更换 workspace 或系统提示 | 仅 Claude：重启会话后更新 `--system-prompt` | 不涉及系统提示 | 不涉及系统提示 |

以上即本项目中 Claude、Gemini 与 Codex 命令的输入方式、flags/options 与不同场景的对应关系。
