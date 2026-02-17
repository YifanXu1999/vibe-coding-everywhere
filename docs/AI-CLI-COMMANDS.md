# AI CLI 命令与选项说明

本文档说明服务端如何根据客户端请求和配置，为 **Claude CLI**、**Gemini CLI** 与 **Codex app-server** 构建运行参数，并描述不同场景下的 flags/options 与会话流程。

## 概览

- 客户端通过 Socket.IO 的 `submit-prompt` 事件发送 `prompt` 和可选选项。
- 服务端根据 `provider` 选择运行路径：`claude/gemini` 走 `buildArgs + pty.spawn`；`codex` 走 `codex app-server` JSON-RPC 会话。
- 工作目录固定为服务端配置的 `WORKSPACE_CWD`。

### 快速命令（Claude / Gemini / Codex）

```bash
# Claude（首轮）
claude --output-format stream-json --verbose --session-id "<session-id>" --permission-mode bypassPermissions -p "Summarize this repo"

# Claude（续写）
claude --output-format stream-json --verbose --resume "<session-id>" --permission-mode default --allowedTools Read Write -p "Continue with tests"

# Gemini（首轮）
gemini --output-format stream-json --approval-mode auto_edit -p "Summarize this repo"

# Gemini（续写）
gemini --output-format stream-json --resume --approval-mode auto_edit -p "Continue with tests"

# Codex（app-server）
codex app-server

# Codex（可选 profile）
codex app-server --profile vibe-coding
```

---

## Claude CLI

**二进制名：** `claude`
**配置模块：** `server/process/claude.js`

### 始终添加的参数

| 参数                            | 说明                       |
| ------------------------------- | -------------------------- |
| `--output-format stream-json` | 以 JSON 流式输出，便于解析 |
| `--verbose`                   | 详细日志                   |
| `-p <prompt>`                 | 用户提示词（必填）         |

### 按场景添加的参数

#### 1. 续写（Continue）

| 条件                                                      | 添加参数                      | 说明                  |
| --------------------------------------------------------- | ----------------------------- | --------------------- |
| `opts.useContinue === false` 且 `opts.sessionId` 存在 | `--session-id <session_id>` | 首轮对话绑定会话 ID。 |
| `opts.useContinue === true` 且 `opts.sessionId` 存在  | `--resume <session_id>`     | 在同一会话上续写。    |

**何时出现：** 服务端会在首次时分配 `sessionId`，后续 turn 自动改为 `--resume <session_id>`。

#### 2. 权限模式（Permission mode）

| 条件                         | 添加参数                     | 说明                                                         |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------ |
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

| 条件                             | 添加参数                        | 说明                                                        |
| -------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| `opts.allowedTools` 为非空数组 | `--allowedTools` + 若干工具名 | 限制本次会话只允许使用的工具（如 `Read`、`Write` 等）。 |

**来源：** 客户端在 `submit-prompt` 中传 `allowedTools: string[]`。常用于“权限被拒后重试”时，只放开用户同意过的工具。

#### 4. 追加系统提示（Append system prompt）

| 条件                       | 添加参数                   | 说明                                                                                     |
| -------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `opts.systemPrompt` 非空 | `--system-prompt <text>` | 服务端将 `prompts/` 下各子目录拼成的系统提示（含访问限制、预览地址等）通过此参数传入。 |

**来源：** 仅当 `provider === "claude"` 时，服务端调用 `getChatSystemPrompt()` 得到内容并赋给 `systemPrompt`；Gemini 不使用此选项。

### Claude 命令示例

```bash
# 首次对话，默认权限模式，无工具限制
claude --output-format stream-json --verbose --session-id "xxxx-xxxx" --permission-mode bypassPermissions -p "Hello"

# 续写 + 指定权限模式 + 允许 Read/Write
claude --output-format stream-json --verbose --resume "xxxx-xxxx" --permission-mode default --allowedTools Read Write -p "Continue"

# 带自定义系统提示
claude --output-format stream-json --verbose --system-prompt "You are in workspace /path/to/project." -p "Refactor index.js"
```

---

## Gemini CLI

**二进制名：** `gemini`
**配置模块：** `server/process/gemini.js`

### 始终添加的参数

| 参数                            | 说明               |
| ------------------------------- | ------------------ |
| `--output-format stream-json` | 以 JSON 流式输出   |
| `-p <prompt>`                 | 用户提示词（必填） |

### 按场景添加的参数

#### 1. 续写（Resume）

| 条件                          | 添加参数     | 说明                                                                                                                                                                                                     |
| ----------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opts.useContinue === true` | `--resume` | 恢复最近一次会话后继续；服务端在**首轮对话完成后**的后续 `submit-prompt` 中自动将 `useContinue` 设为 `true`。续写前会先结束当前 PTY 进程，再以 `--resume` 启动新进程，从而加载上一轮会话。 |

（Gemini CLI 使用 `--resume` 恢复最近会话；会话按项目自动保存，详见官方文档。）

#### 2. 审批模式（Approval mode）

| 条件                       | 添加参数                   | 说明                        |
| -------------------------- | -------------------------- | --------------------------- |
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
**运行模块：** `server/process/codexAppServerSession.js`（由 `server/process/index.js` 调用）

本项目中的 Codex 仅使用 **app-server(JSON-RPC)** 路径。

### 启动方式（服务端内部）

服务端启动命令：

```bash
codex app-server [--profile <name>] [--config skip_git_repo_check=true]
```

会话流程：

1. `initialize`
2. `thread/start`（首次或 thread 失效时）
3. `turn/start`（每次用户输入）

续写通过复用同一个 `thread_id` 完成。

#### 系统提示（System prompt）

Codex app-server 路径下，系统提示通过 **thread/start 的 baseInstructions** 注入（与 Claude 同源：`prompts/` 合并后的 `getChatSystemPrompt()`）。

| 条件                              | 行为                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 使用 Codex app-server（当前默认） | 服务端在 `thread/start` 时传入 `baseInstructions: getChatSystemPrompt()`，无需 profile 文件。                                       |
| 设置环境变量 `CODEX_PROFILE`    | 服务端在 `codex app-server` 启动时添加 `--profile <name>`，从 `~/.codex/config.toml` 的 `[profiles.<name>]` 加载 profile 配置。 |

**编辑 system prompt：** 直接修改 `prompts/` 下内容（如 `output-enhancement/1.command.txt`），重启服务即可。

**使用全局 profile（`~/.codex/config.toml`）示例：**

```toml
[profiles.vibe-coding]
model = "gpt-5-codex"
approval_policy = "on-request"
```

然后在 `.env` 或环境中设置 `CODEX_PROFILE=vibe-coding`，重启服务后 Codex app-server 会使用该 profile。

### 续写（Resume）

| 条件                                                | 行为                                  | 说明                                                  |
| --------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `opts.useContinue === true` 且 `sessionId` 存在 | 使用现有 thread 执行 `turn/start`   | `sessionId` 来自首轮 `thread.started.thread_id`。 |
| `sessionId` 丢失/不一致                           | 先 `thread/start` 再 `turn/start` | 服务端自动重建 thread。                               |

**Session ID 来源：** 服务端在 app-server 通知 `thread/started` 中读取 `thread.id`，并透传为 `thread.started.thread_id` 写入 `session_management.session_id`。

### 审批/权限映射（客户端 → Codex）

| 客户端 UI            | Codex 参数                                                   |
| -------------------- | ------------------------------------------------------------ |
| YOLO                 | `--yolo` 或 `--dangerously-bypass-approvals-and-sandbox` |
| Always ask           | `--ask-for-approval untrusted`                             |
| Ask once per session | `--ask-for-approval on-request`                            |

### Codex 命令示例

```bash
# 启动 app-server（通常由服务端自动启动）
codex app-server

# 带 profile 启动（可选）
codex app-server --profile vibe-coding
```

---

## 客户端 payload → 服务端 options → CLI 参数 对应关系

### submit-prompt 的 payload 字段（客户端）

| 字段               | 类型                              | 适用 Provider | 说明                                 |
| ------------------ | --------------------------------- | ------------- | ------------------------------------ |
| `prompt`         | string                            | 两者          | 用户输入，必填（续写时可为空字符串） |
| `provider`       | `"claude" \| "gemini" \| "codex"` | 三者          | 不传则用服务端 `DEFAULT_PROVIDER`  |
| `permissionMode` | string                            | Claude        | 传给 Claude 的 `--permission-mode` |
| `allowedTools`   | string[]                          | Claude        | 传给 Claude 的 `--allowedTools`    |
| `approvalMode`   | string                            | Gemini        | 传给 Gemini 的 `--approval-mode`   |
| `askForApproval` | string                            | Codex         | 传给 Codex 的 `--ask-for-approval` |
| `fullAuto`       | boolean                           | Codex         | 传给 Codex 的 `--full-auto`        |
| `yolo`           | boolean                           | Codex         | 传给 Codex 的 `--yolo`             |
| `replaceRunning` | boolean                           | 三者          | 为 true 时先结束当前会话再起新进程   |

### 服务端 options 的构造（process/index.js）

- **Claude：**`permissionMode`、`allowedTools`、`useContinue`、`systemPrompt`（来自 `getChatSystemPrompt()`）。
- **Gemini：**`approvalMode`、`useContinue`（续写时加 `--resume`）；无 `permissionMode` / `allowedTools` / `systemPrompt`。
- **Codex（app-server）：**
  `useContinue`、`sessionId`（来自 `thread.started.thread_id`）；`thread/start` 时传入 `baseInstructions: getChatSystemPrompt()` 注入 system prompt（与 Claude 同源，来自 `prompts/`）。可选 `codexProfile`（来自 `CODEX_PROFILE`）、`askForApproval`、`fullAuto`、`yolo`、`model`、`skipGitRepoCheck`。

### 环境变量与默认值（server/config/index.js）

| 变量                             | 说明                                                                                                                                                        | 默认值                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `DEFAULT_PERMISSION_MODE`      | Claude 默认权限模式                                                                                                                                         | `bypassPermissions` |
| `DEFAULT_GEMINI_APPROVAL_MODE` | Gemini 默认审批模式                                                                                                                                         | `auto_edit`         |
| `DEFAULT_PROVIDER`             | 未指定时的 AI 提供方                                                                                                                                        | `gemini`            |
| `CODEX_PROFILE`                | Codex 使用的 profile 名（对应 `~/.codex/config.toml` 中 `[profiles.<name>]`）；app-server 下 system prompt 通过 `baseInstructions` 注入，不依赖此变量 | 空                    |

---

## 典型使用场景小结

| 场景                      | Claude                                                                             | Gemini                                                      | Codex                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 首次发送一条 prompt       | `-p "..."` + 可选 `--permission-mode`、`--allowedTools`、`--system-prompt` | `-p "..."` + 可选 `--approval-mode`                     | 服务端启动 `codex app-server`，然后发 `thread/start` + `turn/start`  |
| 同会话内再次发送（续写）  | 改为 `--resume <session_id>`，其余同上                                           | 先结束当前进程，再以 `--resume` + `-p "..."` 启动新进程 | 复用已有 `thread_id`，继续发送 `turn/start`                            |
| 权限/审批                 | 使用新的 `permissionMode` / `allowedTools` 重试                                | 不涉及 permission/allowedTools                              | 使用 `askForApproval` / `fullAuto` / `yolo`                          |
| 更换 workspace 或系统提示 | 仅 Claude：重启会话后更新 `--system-prompt`                                      | 不涉及系统提示                                              | 修改 `prompts/` 后重启，或通过 `CODEX_PROFILE` 调整 Codex profile 配置 |

以上即本项目中 Claude、Gemini 与 Codex 命令的输入方式、flags/options 与不同场景的对应关系。
