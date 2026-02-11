# Cyx - Claude Terminal with Mobile Support

Web and mobile clients that connect to a local Claude Code CLI via Socket.IO. The server spawns `claude` in a PTY and streams output in real time.

## Architecture

- **Server** (`server.js`): Express + Socket.IO + node-pty, spawns `claude` CLI
- **Web client** (`public/`): HTML/JS chat UI served at `/`
- **Mobile client** (`apps/mobile/`): Expo React Native app with the same layout and agent interaction logic

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

### Port configuration

By default the server uses port 3456. Override with:

- `PORT` or `SERVER_PORT`: used by the funnel script to build the server URL
- Example: `PORT=4000 npm run dev:mobile:funnel`

## API / Socket events

- `submit-prompt` – Start a Claude session with a prompt
- `output` – PTY output stream
- `claude-started` – Session started
- `exit` – Session ended
- `input` – Send user input (e.g. for permission prompts)
- `run-render-command` – Execute render command and open preview URL
- `run-render-result` – Result of run-render-command
