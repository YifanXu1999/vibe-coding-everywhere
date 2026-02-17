# Server Module Structure

This directory contains the refactored server code, organized into modular components for better maintainability. Supports multiple AI providers (Claude, Gemini).

## Directory Structure

```
server/
├── config/         # Configuration and environment variables
│   └── index.js    # PORT, WORKSPACE_CWD, DEFAULT_PROVIDER, etc.
├── utils/          # Utility functions
│   └── index.js    # stripAnsi, killProcessOnPort, buildWorkspaceTree, etc.
├── prompts/        # Prompt loading (Claude system prompts)
│   └── index.js    # loadPrompt, getChatSystemPrompt, etc.
├── process/        # AI provider PTY management
│   ├── index.js    # spawnProvider, killPtyProcess, createProcessManager
│   ├── claude.js   # Claude CLI config (binary, buildArgs)
│   └── gemini.js   # Gemini CLI config (binary, buildArgs)
├── routes/         # Express routes
│   └── index.js    # API endpoints (/api/config, /api/workspace-tree, etc.)
└── socket/         # Socket.IO handlers
    └── index.js    # Real-time communication handlers
```

## Main Entry Point

The main `server.js` file in the project root imports from these modules:

```javascript
import { PORT } from "./server/config/index.js";
import { shutdown } from "./server/process/index.js";
import { setupRoutes } from "./server/routes/index.js";
import { setupSocketHandlers } from "./server/socket/index.js";
```

## Adding New Features

1. **New API routes**: Add to `server/routes/index.js`
2. **New Socket events**: Add to `server/socket/index.js`
3. **New PTY AI provider**: Add `server/process/<provider>.js` and register in `process/index.js` (`PTY_PROVIDER_CONFIG`)
4. **New utilities**: Add to appropriate module or create new module
5. **New configuration**: Add to `server/config/index.js`
