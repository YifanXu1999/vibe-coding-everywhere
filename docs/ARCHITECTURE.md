# Architecture Guide

This document describes the system architecture, design patterns, and component relationships.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                 │
├─────────────────────┬─────────────────────┬─────────────────────┤
│   Web Browser       │   iOS Device        │   Android Device    │
│                     │                     │                     │
│   - HTML/JS         │   - Expo/React      │   - Expo/React      │
│   - Socket.IO       │   - Socket.IO       │   - Socket.IO       │
└─────────┬───────────┴──────────┬──────────┴──────────┬──────────┘
          │                      │                     │
          └──────────────────────┼─────────────────────┘
                                 │ Socket.IO
                    ┌────────────▼────────────┐
                    │      SERVER             │
                    │  ┌─────────────────┐    │
                    │  │  Express HTTP   │    │
                    │  │  - Static files │    │
                    │  │  - REST API     │    │
                    │  └────────┬────────┘    │
                    │           │             │
                    │  ┌────────▼────────┐    │
                    │  │   Socket.IO     │◄───┼── Real-time events
                    │  │   - Connection  │    │
                    │  │   - Events      │    │
                    │  └────────┬────────┘    │
                    │           │             │
                    │  ┌────────▼────────┐    │
                    │  │   node-pty      │    │
                    │  │   - Spawn       │    │
                    │  │   - PTY I/O     │    │
                    │  └────────┬────────┘    │
                    └───────────┼─────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Claude Code CLI     │
                    │   - Local execution   │
                    │   - File operations   │
                    │   - Tool use          │
                    └───────────────────────┘
```

## Server Architecture

### Module Organization

```
server.js (entry point)
    │
    ├──► config/      # Environment & configuration
    ├──► routes/      # HTTP request handlers
    ├──► socket/      # WebSocket event handlers
    ├──► process/     # Claude PTY management
    ├──► prompts/     # System prompt loading
    └──► utils/       # Shared utilities
```

### Request Flow

```
HTTP Request          Socket Event
     │                    │
     ▼                    ▼
┌─────────┐         ┌───────────┐
│ Express │         │ Socket.IO │
│ Routes  │         │ Handlers  │
└────┬────┘         └─────┬─────┘
     │                    │
     └────────┬───────────┘
              │
       ┌──────▼──────┐
       │  Services   │
       │ - File I/O  │
       │ - Process   │
       │ - Prompts   │
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │ Claude CLI  │
       │ (PTY)       │
       └─────────────┘
```

### Key Components

#### Config (`server/config/`)

- Resolves workspace directory from CLI args or environment
- Sets up logging paths
- Defines constants (PORT, refresh intervals, etc.)

#### Routes (`server/routes/`)

| Route | Purpose |
|-------|---------|
| `/api/config` | Server configuration for clients |
| `/api/workspace-path` | Absolute path to current workspace |
| `/api/workspace-tree` | File tree for sidebar |
| `/api/workspace-file` | File content with size limits |
| `/api/preview-raw` | Raw file serving for previews |
| `*` | Static file serving |

#### Socket (`server/socket/`)

Two main managers:

1. **ClaudeProcessManager**: Handles Claude PTY lifecycle
2. **RunRenderManager**: Manages terminal processes for commands

#### Process (`server/process/`)

- Spawns Claude with proper arguments
- Manages PTY I/O streaming
- Handles process cleanup on shutdown

### Data Flow: Claude Session

```
1. Client emits "submit-prompt"
          │
          ▼
2. Server spawns Claude PTY
   - Sets up logging
   - Configures TTY
          │
          ▼
3. Claude starts, emits "claude-started"
          │
          ▼
4. Output streams via "output" events
   (JSON lines from Claude CLI)
          │
          ▼
5. Session ends, emits "exit"
```

## Mobile App Architecture

### Layer Structure

```
┌─────────────────────────────────────┐
│  UI Layer (Components)              │
│  - MessageBubble                    │
│  - InputPanel                       │
│  - WorkspaceSidebar                 │
│  - etc.                             │
├─────────────────────────────────────┤
│  Hook Layer                         │
│  - useSocket (main state)           │
│  - Custom hooks                     │
├─────────────────────────────────────┤
│  Service Layer                      │
│  - Socket management                │
│  - Claude event strategies          │
│  - File operations                  │
│  - Server config                    │
├─────────────────────────────────────┤
│  Domain Layer (Core)                │
│  - Types & interfaces               │
│  - Pure functions                   │
└─────────────────────────────────────┘
```

### Component Organization

Components are grouped by feature:

```
components/
├── chat/          # Chat-related UI
├── file/          # File management UI
├── preview/       # Preview/render UI
└── common/        # Shared components
```

### State Management

Single source of truth in `useSocket` hook:

```typescript
// Key state pieces
const [messages, setMessages] = useState<Message[]>([]);
const [claudeRunning, setClaudeRunning] = useState(false);
const [terminals, setTerminals] = useState<TerminalState[]>([]);
const [pendingRender, setPendingRender] = useState<PendingRender | null>(null);
```

### Event Handling Strategy

Claude events are handled via a strategy pattern:

```typescript
// Each event type has a handler
const handlers = new Map<string, Handler>([
  ["system", handleSystem],
  ["assistant", handleAssistant],
  ["input", handleInput],
  // ...
]);

// Dispatcher looks up and calls handler
const handler = handlers.get(eventType);
if (handler) handler(data, context);
```

This allows adding new event types without modifying the dispatcher.

### Dependency Injection

Key interfaces for testability:

```typescript
// Server configuration
interface IServerConfig {
  getBaseUrl(): string;
  resolvePreviewUrl(url: string): string;
}

// File operations
interface IWorkspaceFileService {
  fetchFile(path: string): Promise<{ content: string; isImage: boolean }>;
}
```

Implementations are injected via props or context.

## Design Patterns

### 1. Strategy Pattern

Used in:
- Claude event handling (different strategies per event type)
- Terminal input policy (decide input state based on conditions)

### 2. Dependency Injection

Used in:
- Server config injection
- File service injection
- Socket factory for testing

### 3. Interface Segregation

Small, focused interfaces:
- `IChatState` - chat messages and typing
- `ITerminalState` - terminals and selection
- `IPermissionState` - permission denials

Components depend only on interfaces they need.

### 4. Factory Pattern

Used for:
- Creating server configs
- Creating workspace file services
- Creating socket connections

## Security Considerations

### Workspace Isolation

- All file paths are normalized and checked against workspace root
- Path traversal attacks are blocked
- Example: `/api/workspace-file?path=../../etc/passwd` → 403

### Process Isolation

- Claude runs in PTY with workspace as CWD
- Terminal commands run in separate processes
- Cleanup on disconnect/shutdown

## Performance

### File Size Limits

- Text files: 512KB max (prevents huge files from freezing UI)
- Images: Served as base64

### Throttling

- Scroll-to-end throttled to 400ms
- Workspace tree refresh interval configurable (default 3s)

### Lazy Loading

- File content loaded on demand
- Preview only loads when requested
