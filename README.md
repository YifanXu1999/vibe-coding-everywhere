# Vibe Coding Everywhere

Web and mobile clients that connect to a local AI coding assistant (Claude Code CLI or Gemini CLI) via Socket.IO. The server spawns the selected CLI in a PTY and streams output in real time.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Mobile Setup](#mobile-setup)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## Overview

This project provides a web-based and mobile interface for interacting with AI coding assistants. It consists of:

- **Server**: Express + Socket.IO + node-pty that spawns Claude CLI or Gemini CLI
- **Web Client**: HTML/JS chat UI served at the root URL
- **Mobile Client**: Expo React Native app for iOS/Android devices

## Quick Start

See [Quick Start Guide](docs/QUICKSTART.md) for the fastest setup.

### Prerequisites

- Node.js (v18+)
- At least one AI CLI installed and in PATH:
  - [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code)
  - [Gemini CLI](https://github.com/google/gemini-cli) (`npm i -g @google/gemini-cli`)
- (Optional) [Tailscale](https://tailscale.com) for mobile access

### Installation

```bash
npm install
```

### Run the Server

```bash
npm start
```

The server listens on `http://localhost:3456` (configurable via `PORT` env var).

For development with auto-restart:

```bash
npm run dev
```

### Access the Web Client

Open http://localhost:3456 in your browser.

### Run the Mobile App

See [Mobile Setup](#mobile-setup) below.

---

## Architecture

```
┌─────────────────┐     Socket.IO      ┌──────────────────┐
│   Web Client    │ ◄────────────────► │   Express Server │
│   (Browser)     │                    │   + node-pty     │
└─────────────────┘                    └────────┬─────────┘
                                                │
┌─────────────────┐     Socket.IO      ┌───────▼─────────┐
│  Mobile Client  │ ◄────────────────► │  AI CLI (PTY)   │
│  (iOS/Android)  │                    │  Claude / Gemini│
└─────────────────┘                    └─────────────────┘
```

### Server Structure

The server is organized into modular components:

```
server/
├── config/         # Environment configuration
├── utils/          # Utility functions (ANSI stripping, workspace tree)
├── prompts/        # System prompt loading (Claude)
├── process/        # AI provider PTY management (Claude/Gemini)
│   ├── claude.js   # Claude CLI config
│   └── gemini.js   # Gemini CLI config
├── routes/         # Express API routes
└── socket/         # Socket.IO event handlers
```

### Mobile App Structure

The mobile app follows a service-oriented architecture:

```
apps/mobile/src/
├── components/     # React components by feature
│   ├── chat/       # Chat UI components
│   ├── file/       # File viewer, sidebar
│   ├── preview/    # Web preview, terminal output
│   └── common/     # Shared components
├── core/           # Domain types and interfaces
├── services/       # Business logic
│   ├── socket/     # Socket connection hook
│   ├── server/     # Server configuration
│   ├── file/       # File operations
│   └── providers/  # AI provider event handling (Claude, Gemini)
└── theme/          # Styling constants
```

### Design Patterns

- **Dependency Injection**: Server config and file services are injected for testability
- **Strategy Pattern**: Claude events are dispatched via pluggable handlers
- **Interface Segregation**: Components depend on small, focused interfaces

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3456` |
| `WORKSPACE` / `WORKSPACE_CWD` | AI CLI working directory | Server directory |
| `DEFAULT_PROVIDER` | AI provider: `claude` or `gemini` | `gemini` |
| `DEFAULT_PERMISSION_MODE` | Claude permission mode | `bypassPermissions` |
| `DEFAULT_GEMINI_APPROVAL_MODE` | Gemini approval mode: `default`, `auto_edit`, `plan` | `auto_edit` |
| `SIDEBAR_REFRESH_INTERVAL_MS` | File tree refresh interval | `3000` |

### Command Line

Set workspace via command line:

```bash
# Positional argument
npm start -- /path/to/project

# Explicit flag
node server.js --workspace /path/to/project
```

---

## Mobile Setup

### Option A: Simulator / Local Development

1. Start the server:
   ```bash
   npm start
   ```

2. In another terminal, start the mobile app:
   ```bash
   npm run dev:mobile
   ```

3. Open in iOS Simulator or Android emulator.

### Option B: Physical Device with Tailscale

1. Install [Tailscale](https://tailscale.com) on your desktop and mobile device
2. Ensure both are on the same tailnet:
   ```bash
   tailscale up
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Start the mobile app with tunnel:
   ```bash
   npm run dev:mobile:funnel
   ```
5. Scan the QR code with Expo Go on your phone

### Mobile Environment Variables

- `EXPO_PUBLIC_SERVER_URL`: Server URL (set automatically by scripts)
- `EXPO_PUBLIC_DEFAULT_PERMISSION_MODE`: Default Claude permission mode
- `EXPO_PUBLIC_PREVIEW_HOST`: Custom preview host for port-to-port access

---

## API Reference

### Socket Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `submit-prompt` | `{ prompt, provider?, permissionMode?, allowedTools?, approvalMode? }` | Start AI session (Claude or Gemini) |
| `input` | `string` | Send input to Claude |
| `resize` | `{ cols, rows }` | Resize PTY |
| `claude-terminate` | — | Kill Claude process |
| `run-render-command` | `{ command, url? }` | Execute command in new terminal |
| `run-render-write` | `{ terminalId, data }` | Write to terminal stdin |
| `run-render-terminate` | `{ terminalId }` | Kill terminal process |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `output` | `string` | AI output stream |
| `claude-started` | `{ provider, permissionMode, allowedTools, useContinue, approvalMode? }` | Session started |
| `exit` | `{ exitCode }` | Session ended |
| `run-render-started` | `{ terminalId, pid? }` | Terminal created |
| `run-render-stdout` | `{ terminalId, chunk }` | Terminal stdout |
| `run-render-stderr` | `{ terminalId, chunk }` | Terminal stderr |
| `run-render-exit` | `{ terminalId, code, signal }` | Terminal exited |

### REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/config` | Server configuration |
| `GET /api/workspace-path` | Current workspace path |
| `GET /api/workspace-tree` | File tree JSON |
| `GET /api/workspace-file?path=...` | File content |
| `GET /api/preview-raw?path=...` | Raw file for preview |

---

## Development

### Project Scripts

```bash
# Server
npm start              # Start server
npm run dev            # Start with nodemon

# Mobile
npm run dev:mobile     # Start Expo with local server
npm run dev:mobile:funnel  # Start with Tailscale tunnel

# Other
npm run icons:convert  # Convert icons
```

### Adding Features

**New AI Provider:**

1. Add config in `server/process/<provider>.js`
2. Register in `server/process/index.js` (`PROVIDER_CONFIG`)

**New AI Event Handler (mobile):**

1. Add handler in `apps/mobile/src/services/providers/<provider>/`
2. Register in provider event dispatcher

**New API Route:**

1. Add route in `server/routes/index.js`

**New Mobile Component:**

1. Place in appropriate `apps/mobile/src/components/` subdirectory
2. Import types from `apps/mobile/src/core/types`

---

## Troubleshooting

### Mobile can't connect to server

- Ensure server is running and accessible
- Check firewall settings
- For Tailscale: verify both devices show in `tailscale status`

### AI CLI not found

Ensure at least one CLI is installed and in PATH:

```bash
# Claude
which claude && claude --version

# Gemini
which gemini && gemini --version
# Install: npm i -g @google/gemini-cli
```

### Port already in use

Kill process on port 3456 or use different port:

```bash
PORT=3457 npm start
```

---

## Documentation

- [Quick Start](docs/QUICKSTART.md) - Get running in 5 minutes
- [Architecture](docs/ARCHITECTURE.md) - System design and patterns
- [API Reference](docs/API.md) - Complete API documentation
- [Development](docs/DEVELOPMENT.md) - Development workflows
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guide

## License

Private - For internal use only.
