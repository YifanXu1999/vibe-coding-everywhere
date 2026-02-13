# Quick Start Guide

Get up and running in 5 minutes.

## Prerequisites

- Node.js 18+
- At least one AI CLI installed:
  - **Claude Code CLI** (`claude --version` to check)
  - **Gemini CLI** (`npm i -g @google/gemini-cli`, then `gemini --version`)
- (Optional) Tailscale account for mobile access

## 1. Install

```bash
git clone <repo-url>
cd vibe-coding-everywhere
npm install
```

## 2. Start Server

```bash
npm start
```

Server runs at `http://localhost:3456`.

## 3. Open Web Client

Visit http://localhost:3456 in your browser.

Start chatting with Claude or Gemini! The default provider is configurable via `DEFAULT_PROVIDER` (env: `claude` or `gemini`).

## Mobile Setup (Optional)

### Same Machine (Simulator)

```bash
# Terminal 1
npm start

# Terminal 2
npm run dev:mobile
```

### Physical Device (Tailscale)

```bash
# Install Tailscale
tailscale up

# Terminal 1
npm start

# Terminal 2
npm run dev:mobile:funnel
```

Scan QR code with Expo Go app.

## Common Commands

```bash
# Dev mode with auto-restart
npm run dev

# With custom workspace
npm start -- /path/to/project

# With custom port
PORT=3457 npm start
```

## Next Steps

- Read [Architecture Guide](ARCHITECTURE.md) for system overview
- Read [API Documentation](API.md) for event reference
- Read [Development Guide](DEVELOPMENT.md) for contributing
- Read [Deployment Guide](DEPLOYMENT.md) for production setup

## Troubleshooting

**AI CLI not found?**
```bash
# Claude: install from Anthropic
which claude && claude --version

# Gemini: install globally
npm i -g @google/gemini-cli
which gemini && gemini --version
```

**Port in use?**
```bash
PORT=3457 npm start
```

**Mobile won't connect?**
```bash
# Check Tailscale
tailscale status

# Check server
curl http://localhost:3456/api/config
```
