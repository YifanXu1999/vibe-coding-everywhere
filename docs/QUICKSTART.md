# Quick Start Guide

Get up and running in 5 minutes.

## Prerequisites

- Node.js 18+
- Claude Code CLI installed (`claude --version` to check)
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

Start chatting with Claude!

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

**Claude not found?**
```bash
# Install Claude Code CLI from Anthropic
# Then verify:
which claude
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
