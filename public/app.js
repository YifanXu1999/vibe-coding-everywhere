const chatMessages = document.getElementById("chat-messages");
const typingIndicator = document.getElementById("typing-indicator");
const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const inputForm = document.getElementById("input-form");
const statusDot = document.getElementById("status-dot");
const statusLabel = document.getElementById("status-label");
const permissionContainer = document.getElementById("permission-denial-container");
const permissionModeSelect = document.getElementById("permission-mode");
const chatTitleEl = document.getElementById("chat-title");
const btnOptions = document.getElementById("btn-options");
const optionsPopover = document.getElementById("options-popover");
const optionsList = document.getElementById("options-list");
const optionsHint = document.getElementById("options-hint");
const renderPreviewBar = document.getElementById("render-preview-bar");
const renderCommandEl = document.getElementById("render-command");
const renderUrlEl = document.getElementById("render-url");
const btnRunRender = document.getElementById("btn-run-render");

const socket = io();

let claudeRunning = false;
/** Options used for the current or last Claude run (set by server on claude-started). */
let lastRunOptions = { permissionMode: null, allowedTools: [], useContinue: false };
let waitingForUserInput = false;
let outputBuffer = "";
let currentAssistantMessage = null;
/** When set, the response contained render command + URL; show the run-preview bar. */
let pendingRender = null;

const DEFAULT_PLACEHOLDER = "Reply...";
// Remove PTY control/escape sequences sent by the Claude CLI (e.g. cursor hide/show codes).
const ANSI_REGEX =
  /\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-_]|\x1B.|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

const RENDER_CMD_REGEX = /Run the following command for render:\s*"([^"]+)"/i;
const RENDER_URL_REGEX = /URL for preview:\s*"([^"]+)"/i;

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatText(text) {
  return escapeHtml(text || "").replace(/\n/g, "<br>");
}

function stripAnsi(value) {
  if (!value) return "";
  return value.replace(ANSI_REGEX, "");
}

function scrollToBottom() {
  chatMessages.parentElement.scrollTo({
    top: chatMessages.parentElement.scrollHeight,
    behavior: "smooth",
  });
}

function createMessageElement(role, content, meta = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "assistant" ? "C" : role === "user" ? "You" : "!";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(content);
  bubble.dataset.rawText = content || "";

  if (role === "user") {
    wrapper.appendChild(bubble);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
  }

  if (role === "system") {
    wrapper.classList.add("system");
  }

  if (meta.id) wrapper.dataset.id = meta.id;

  chatMessages.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function addSystemMessage(text) {
  return createMessageElement("system", text);
}

function addUserMessage(text) {
  return createMessageElement("user", text);
}

function ensureAssistantMessage() {
  if (!currentAssistantMessage) {
    currentAssistantMessage = createMessageElement("assistant", "");
  }
  return currentAssistantMessage;
}

function getAssistantRawText() {
  const bubbles = chatMessages.querySelectorAll(".message.assistant .bubble");
  return Array.from(bubbles)
    .map((el) => el.dataset.rawText || "")
    .join("\n");
}

function extractRenderCommandAndUrl(text) {
  if (!text || typeof text !== "string") return null;
  const cmdMatch = text.match(RENDER_CMD_REGEX);
  const urlMatch = text.match(RENDER_URL_REGEX);
  if (!cmdMatch?.[1] || !urlMatch?.[1]) return null;
  return { command: cmdMatch[1].trim(), url: urlMatch[1].trim() };
}

function showRenderPreviewBar() {
  if (!pendingRender || !renderPreviewBar || !renderCommandEl || !renderUrlEl) return;
  renderCommandEl.textContent = pendingRender.command;
  renderUrlEl.href = pendingRender.url;
  renderUrlEl.textContent = pendingRender.url;
  renderPreviewBar.hidden = false;
}

function hideRenderPreviewBar() {
  if (renderPreviewBar) renderPreviewBar.hidden = true;
}

function updatePendingRender() {
  const raw = getAssistantRawText();
  const next = extractRenderCommandAndUrl(raw);
  if (next && (!pendingRender || next.command !== pendingRender.command || next.url !== pendingRender.url)) {
    pendingRender = next;
    showRenderPreviewBar();
  } else if (!next) {
    pendingRender = null;
    hideRenderPreviewBar();
  }
}

function appendAssistantText(chunk) {
  const sanitized = stripAnsi(chunk);
  if (!sanitized) return;
  const message = ensureAssistantMessage();
  const bubble = message.querySelector(".bubble");
  const current = bubble.dataset.rawText || "";
  const next = current + sanitized;
  bubble.dataset.rawText = next;
  bubble.innerHTML = formatText(next);
  updatePendingRender();
  if (claudeRunning) {
    setTypingIndicator(true);
  }
}

function finalizeAssistantMessage() {
  if (currentAssistantMessage) {
    currentAssistantMessage = null;
  }
  setTypingIndicator(false);
  updatePendingRender();
}

function setTypingIndicator(state) {
  typingIndicator.hidden = !state;
}

function setConnectionState(connected) {
  statusDot.classList.toggle("connected", connected);
  statusDot.classList.toggle("disconnected", !connected);
  statusLabel.textContent = connected ? "Online" : "Offline";
}

function refreshInputState() {
  if (waitingForUserInput) {
    promptInput.placeholder = "Type response for Claude…";
    promptInput.disabled = false;
    sendBtn.disabled = false;
    return;
  }
  promptInput.placeholder = DEFAULT_PLACEHOLDER;
  const disabled = claudeRunning;
  promptInput.disabled = disabled;
  sendBtn.disabled = disabled;
}

function enableInteractiveInput(prompt) {
  waitingForUserInput = true;
  if (prompt) addSystemMessage(prompt);
  refreshInputState();
}

function disableInteractiveInput() {
  waitingForUserInput = false;
  refreshInputState();
}

function deniedToolToAllowedPattern(toolName) {
  if (!toolName || typeof toolName !== "string") return null;
  const t = toolName.trim();
  if (t === "Bash") return "Bash(*)";
  if (["Write", "Edit", "Read"].includes(t)) return t;
  return t;
}

function getAllowedToolsFromDenials(denials) {
  if (!Array.isArray(denials) || !denials.length) return [];
  const seen = new Set();
  const out = [];
  for (const denial of denials) {
    const pattern = deniedToolToAllowedPattern(denial.tool_name || denial.tool || "");
    if (pattern && !seen.has(pattern)) {
      seen.add(pattern);
      out.push(pattern);
    }
  }
  return out;
}

function showPermissionDenialBanner(denials) {
  if (!permissionContainer) return;
  const banner = document.createElement("div");
  banner.className = "permission-denial-banner";
  const allowedTools = getAllowedToolsFromDenials(denials);
  const summary = denials.length === 1 ? "Permission denied" : "Permissions denied";
  const detail = denials
    .map((d) => {
      const tool = d.tool_name || d.tool || "?";
      const path = d.tool_input?.file_path || d.tool_input?.path || "";
      return path ? `${tool}: ${path}` : tool;
    })
    .join("<br>");
  banner.innerHTML = `
    <div class="summary">${summary}</div>
    <div class="detail">${detail}</div>
    <div class="actions">
      <button type="button" class="reject">Dismiss</button>
      <button type="button" class="accept">Accept & retry</button>
    </div>
  `;
  banner.querySelector(".reject").addEventListener("click", () => banner.remove());
  banner.querySelector(".accept").addEventListener("click", () => {
    banner.remove();
    const permissionMode = permissionModeSelect?.value || undefined;
    socket.emit("submit-prompt", {
      prompt: "Permissions granted, try again.",
      allowedTools,
      permissionMode,
      retryAfterPermissionDenial: true,
    });
  });
  permissionContainer.appendChild(banner);
}

function isClaudeStream(data) {
  if (typeof data !== "object" || data === null) return false;
  const types = ["system", "assistant", "result", "user", "input", "permission_request"];
  return types.includes(data.type) || Array.isArray(data.permission_denials);
}

function handleClaudeEvent(data) {
  if (Array.isArray(data.permission_denials) && data.permission_denials.length) {
    showPermissionDenialBanner(data.permission_denials);
  }

  switch (data.type) {
    case "system": {
      const info = [];
      if (data.session_id) info.push(`Session ID: ${data.session_id}`);
      if (data.model) info.push(`Model: ${data.model}`);
      if (data.cwd) info.push(`Working Directory: ${data.cwd}`);
      if (data.model) {
        const modelNameEl = document.querySelector(".model-name");
        if (modelNameEl) modelNameEl.textContent = data.model;
      }
      if (info.length) addSystemMessage(info.join("\n"));
      break;
    }
    case "assistant": {
      const parts = [];
      for (const content of data.message?.content || []) {
        if (content.type === "text") {
          parts.push(content.text);
        }
      }
      appendAssistantText(parts.join(""));
      break;
    }
    case "input":
    case "permission_request": {
      const tool = data.tool_name || data.tool || "Tool";
      const prompt = data.prompt || data.message || data.description || "Claude needs your input.";
      enableInteractiveInput(`${tool} request:\n${prompt}\n(Type a response and press Enter)`);
      break;
    }
    case "user": {
      // skip echo
      break;
    }
    case "result": {
      // ignore summary chunk
      break;
    }
    default: {
      if (typeof data === "string") appendAssistantText(`${data}\n`);
    }
  }
}

function handleRawLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isClaudeStream(parsed)) {
        handleClaudeEvent(parsed);
        socket.emit("claude-debug", { type: parsed.type, raw: trimmed });
        return;
      }
    } catch (_) {
      // fall through to plain text
    }
  }
  appendAssistantText(line + "\n");
}

socket.on("output", (chunk) => {
  outputBuffer += chunk;
  const parts = outputBuffer.split("\n");
  const incomplete = parts.pop() ?? "";
  outputBuffer = "";

  for (const part of parts) {
    handleRawLine(part);
  }

  if (incomplete.startsWith("{")) {
    outputBuffer = incomplete;
  } else if (incomplete) {
    appendAssistantText(incomplete);
  }
});

socket.on("connect", () => {
  setConnectionState(true);
});

socket.on("disconnect", () => {
  setConnectionState(false);
});

socket.on("claude-started", (payload) => {
  if (payload && typeof payload === "object") {
    lastRunOptions = {
      permissionMode: payload.permissionMode ?? null,
      allowedTools: Array.isArray(payload.allowedTools) ? payload.allowedTools : [],
      useContinue: !!payload.useContinue,
    };
  }
  claudeRunning = true;
  finalizeAssistantMessage();
  setTypingIndicator(true);
  disableInteractiveInput();
  refreshInputState();
});

socket.on("exit", () => {
  claudeRunning = false;
  disableInteractiveInput();
  refreshInputState();
  finalizeAssistantMessage();
  addSystemMessage("Chat completed.");
  promptInput.focus();
});

socket.on("run-render-result", ({ ok, error }) => {
  if (ok) {
    addSystemMessage("Render command started. Preview should open in a new tab.");
  } else if (error) {
    addSystemMessage(`Failed to run command: ${error}`);
  }
});

function submitPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  if (waitingForUserInput && claudeRunning) {
    socket.emit("input", `${prompt}\r`);
    addUserMessage(prompt);
    promptInput.value = "";
    disableInteractiveInput();
    return;
  }

  if (claudeRunning) return;

  const permissionMode = permissionModeSelect?.value || undefined;
  socket.emit("submit-prompt", { prompt, permissionMode });
  addUserMessage(prompt);
  promptInput.value = "";
}

inputForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitPrompt();
  }
});

sendBtn.addEventListener("click", submitPrompt);

function getCurrentUiOptions() {
  const mode = permissionModeSelect?.value?.trim() || "";
  return {
    permissionMode: mode || null,
    label: mode === "ask" ? "Ask each tool" : mode === "auto" ? "Auto approve" : "Auto",
  };
}

function renderOptionsPopover() {
  const ui = getCurrentUiOptions();
  const run = lastRunOptions;
  optionsList.innerHTML = "";
  const addRow = (dt, dd) => {
    const tr = document.createElement("div");
    tr.className = "options-row";
    tr.innerHTML = `<dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd>`;
    optionsList.appendChild(tr);
  };
  addRow("Permission (next run)", ui.label);
  addRow("Allowed tools (last run)", run.allowedTools.length ? run.allowedTools.join(", ") : "None");
  addRow("Continue mode (last run)", run.useContinue ? "Yes (-c)" : "No");
  optionsHint.textContent = claudeRunning
    ? "Current run is using the options above (last run = this run)."
    : "“Last run” reflects the previous Claude session.";
}

function toggleOptionsPopover() {
  if (!optionsPopover) return;
  const isHidden = optionsPopover.hidden;
  if (isHidden) {
    renderOptionsPopover();
    optionsPopover.hidden = false;
  } else {
    optionsPopover.hidden = true;
  }
}

function closeOptionsPopoverOnClickOutside(e) {
  if (optionsPopover?.hidden) return;
  if (!optionsPopover.contains(e.target) && !btnOptions.contains(e.target)) {
    optionsPopover.hidden = true;
  }
}

document.getElementById("btn-attach")?.addEventListener("click", () => {
  addSystemMessage("Attachments are not supported in this prototype.");
});

document.getElementById("btn-share")?.addEventListener("click", () => {
  addSystemMessage("Share functionality coming soon.");
});

btnOptions?.addEventListener("click", (e) => {
  e.preventDefault();
  toggleOptionsPopover();
});
document.addEventListener("click", closeOptionsPopoverOnClickOutside);

btnRunRender?.addEventListener("click", () => {
  if (!pendingRender) return;
  const { command, url } = pendingRender;
  const msg = `Run the following command and open the preview URL?\n\nCommand: ${command}\n\nURL: ${url}`;
  if (!confirm(msg)) return;
  socket.emit("run-render-command", { command, url });
  setTimeout(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, 800);
});

setConnectionState(false);
refreshInputState();
setTypingIndicator(false);
chatTitleEl.textContent = "Greeting";
