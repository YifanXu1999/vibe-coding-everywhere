# Cyx - Claude Terminal with Mobile Support

Web and mobile clients that connect to a local Claude Code CLI via Socket.IO. The server spawns `claude` in a PTY and streams output in real time.

## Architecture

- **Server** (`server.js`): Express + Socket.IO + node-pty, spawns `claude` CLI
- **Web client** (`public/`): HTML/JS chat UI served at `/`
- **Mobile client** (`apps/mobile/`): Expo React Native app with the same layout and agent interaction logic

### Mobile app structure (SOLID & patterns)

The mobile app is refactored around **dependency injection**, **strategy**, and **interface segregation** so you can extend or test it without changing core logic.

- **`apps/mobile/src/core/`**
  - **`types.ts`** – Domain types and small interfaces: `IConnectionState`, `IChatState`, `ITerminalState`, `IPermissionState`, `IRunRenderState`, `IServerConfig`, `IWorkspaceFileService`. Components depend on these abstractions, not concrete implementations (Interface Segregation).
  - **`serverConfig.ts`** – Default `IServerConfig` (base URL, preview URL resolution). Inject a different implementation for tests or alternate backends (Dependency Injection).
  - **`workspaceFileService.ts`** – Default `IWorkspaceFileService` (fetch workspace file by path). Injected into `App` so file loading is decoupled from `fetch` (Dependency Injection).
  - **`claudeEventStrategies.ts`** – **Strategy pattern**: Claude stream events are dispatched via a registry of handlers (`system`, `assistant`, `input`, `permission_request`, etc.). New event types are added by registering a handler; the dispatcher stays unchanged (Open-Closed).
  - **`terminalInputPolicy.ts`** – Policy for “can the user type in the selected terminal?” (`getTerminalInputState`). Replaces inline conditionals in the UI with a single place to extend behavior (Strategy for complex conditionals).

- **`apps/mobile/src/hooks/useSocket.ts`**
  - Accepts optional `UseSocketOptions.serverConfig` (default: env-based config). Socket URL comes from config, not a hard-coded helper (Dependency Injection).
  - Uses `createClaudeEventDispatcher(context)` instead of a large `switch` on event type (Strategy).
  - Return value is typed so callers can depend on smaller slices (e.g. chat vs terminal) where needed (Interface Segregation).

- **`App.tsx`**
  - Uses `getDefaultServerConfig()` and `createWorkspaceFileService(serverConfig)` (or future context-based injection) for preview URL and file loading (Dependency Injection).
  - Uses `getTerminalInputState(...)` to decide whether to show the terminal command input, disabled hint, or nothing (Strategy).

## Setup

### Prerequisites

- Node.js
- [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code) installed and in PATH

### Install

```bash
npm install
```

### Run server

```bash
npm start
```

Server listens on `http://localhost:3456` (configurable via `PORT`). It binds to `0.0.0.0` so it is reachable on the Tailscale network.

### Web client

With the server running, open http://localhost:3456 in your browser.

## Mobile app (Tailscale)

The mobile app connects to the server over Tailscale so you can use it from your phone or tablet while the server runs on your desktop.

### Prerequisites

- [Tailscale](https://tailscale.com/download) installed on your desktop and mobile device
- Both devices joined to the same tailnet

### Run mobile funnel

1. Start the server in one terminal:
   ```bash
   npm start
   ```

2. In another terminal, run:
   ```bash
   npm run dev:mobile:funnel
   ```

   This script:
   - Reads `tailscale status --json` to get your machine's Tailscale host (IP or MagicDNS)
   - Sets `EXPO_PUBLIC_SERVER_URL` to `http://<tailscale-host>:3456`
   - Starts the Expo app with tunnel mode

3. Scan the QR code with Expo Go on your phone (ensure your phone is on the same Tailscale network).

### Tailscale setup

Ensure Tailscale is running on your desktop:

```bash
tailscale up
```

Check status:

```bash
tailscale status --json
```

### Environment configuration

- **PORT** / **SERVER_PORT**: Server port (default 3456). Used by the funnel script to build the server URL.
- **WORKSPACE** / **WORKSPACE_CWD**: Workspace directory (Claude CWD, file tree, run commands). Defaults to the server’s directory. Can also be set from the command line (see below).
- **SIDEBAR_REFRESH_INTERVAL_MS**: Web client sidebar file tree auto-refresh interval in milliseconds (default 3000). Set to `0` to disable auto-refresh.

### Configure workspace from the command line

You can set the workspace directory when starting the server:

```bash
# Positional argument (first non-option argument)
npm start -- /path/to/your/project

# Or explicit flag
node server.js --workspace /path/to/your/project
```

With nodemon:

```bash
WORKSPACE=/path/to/project npm run dev
```

## API / Socket events

- `submit-prompt` – Start a Claude session with a prompt
- `output` – PTY output stream
- `claude-started` – Session started
- `exit` – Session ended
- `input` – Send user input (e.g. for permission prompts)
- `run-render-command` – Execute render command and open preview URL
- `run-render-result` – Result of run-render-command

### Extending the mobile app (Open-Closed)

- **New Claude stream event type:** Implement a handler in `apps/mobile/src/core/claudeEventStrategies.ts` and register it in `createHandlerRegistry`. No change to the dispatcher or `useSocket` core logic.
- **New server or file backend:** Implement `IServerConfig` or `IWorkspaceFileService` and pass them into `App` (e.g. via React context or props) or into `useSocket({ serverConfig })`.
