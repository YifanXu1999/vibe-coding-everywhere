# Server Module Structure

This directory contains the refactored server code, organized into modular components for better maintainability.

## Directory Structure

```
server/
├── config/         # Configuration and environment variables
│   └── index.js    # PORT, WORKSPACE_CWD, etc.
├── utils/          # Utility functions
│   └── index.js    # stripAnsi, killProcessOnPort, buildWorkspaceTree, etc.
├── prompts/        # Prompt loading and management
│   └── index.js    # loadPrompt, getChatSystemPrompt, etc.
├── process/        # Process management
│   └── index.js    # spawnClaude, killClaudePtyProcess, shutdown
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
3. **New utilities**: Add to appropriate module or create new module
4. **New configuration**: Add to `server/config/index.js`
