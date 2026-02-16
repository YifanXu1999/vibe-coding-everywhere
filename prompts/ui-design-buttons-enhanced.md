# Enhanced UI Design Prompt: Chat Page Buttons for Gemini & Claude Themes

A structured prompt for redesigning or downloading every button on the chat page, with theme-aware styling for both Google (Gemini) and Claude providers. **Focus on Claude component:** includes Chat UI display fixes, permission/session behavior, file-hyperlink feature, and workspace selection redesign.

---

## Claude Component – Implementation Requirements

**Scope:** Chat page, terminal/CLI integration, settings workspace picker. Prioritize Claude provider flows; ensure behavior is consistent and debuggable.

### 1. Chat Page UI – Command Display & Stream Parsing

**Problem:** In some cases, content of `<u 'command' u>` (or equivalent command spans) is not rendered in the chat UI.

**Requirements:**
- Ensure all command spans (e.g. `<u 'command' u>…</u>`) are parsed from the chat stream and displayed correctly in message bubbles.
- Identify and fix parsing/rendering edge cases (nested tags, partial chunks, multiple commands in one message).
- **Deliverable:** Add unit tests for chat stream parsing that cover:
  - Single command in one message
  - Multiple commands
  - Command mixed with plain text and code blocks
  - Incomplete or chunked stream segments
  - Escaped or special characters inside command text

**Acceptance:** Every command sent by the model is visible in the UI; tests document expected input/output for the parser.

---

### 2. Claude Terminal – Permission Once per Session & Logging

**Problem:** Permission is requested more than once per session; should be “ask once” during the session.

**Requirements:**
- Verify the flag/option passed to the terminal (or LLM CLI) that controls “ask permission only once” and ensure it is set correctly for the session.
- Confirm the same flag is respected across all terminal invocations in that session.
- **Logging:** Log each CLI invocation for debugging:
  - **Directory:** `logs/llm-cli-input-output`
  - **Content per run:** the exact command (and args) sent to the terminal, then the full output (json-stream or raw stream).
  - **Format:** Use clear line breaks (e.g. blank lines or a separator like `---`) to separate each **input (command)** from its **output (json-stream)** and to separate consecutive input/output pairs.

**Acceptance:** Permission is asked at most once per session; logs under `logs/llm-cli-input-output` show one command + one output block per run, with unambiguous separation between pairs.

---

### 3. File Modified/Added – Hyperlink to Explorer

**Requirement:** When the agent (or stream) indicates that a file was **modified** or **added**, show that file in the chat UI as a **hyperlink**.

- User can tap/click the link to **navigate to the file’s location** (e.g. open the explorer/sidebar and reveal the file, or focus the file in the project tree).
- Support both “modified” and “added” if the backend distinguishes them (e.g. different label or icon optional).

**Acceptance:** Any reported modified/added file appears as a clickable link; action opens explorer and reveals the file.

---

### 4. Settings – Workspace Selection Redesign

**Problem:** Workspace selection is hard to use; hierarchy and navigation are unclear.

**Requirements:**
- **Model:**  
  - **Root of workspace:** Always show or infer the single “root of workspace” (project root).  
  - **Selected workspace:** Store and display the **relative path** from “root of workspace” to the currently selected workspace (folder).
- **UI – Workspace selection box:**
  - By default, show only **one level down** from the root (e.g. root + immediate children).
  - When the user **clicks a folder**, it **unfolds (expands)** to show its **children** in place (tree behavior).
  - Keep the path readable (e.g. show “root → relative path” or breadcrumb).
- Avoid showing a flat list of all folders; prefer a **tree** that expands on click.

**Acceptance:** User sees root, then relative path; selection is a tree that expands one level at a time on folder click.

---

## Enhanced Prompt (Copy for Stitch / Design Tool)

```markdown
Redesign or provide downloadable assets for every interactive button on the chat page. Each button must visually align with the active provider theme (Gemini or Claude) while supporting both light and dark modes. Buttons should feel native to their brand and maintain consistent touch targets and visual hierarchy.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Mobile (React Native), touch-first
- Theme: Light/Dark mode support per provider
- Grid: 8px base unit; minimum touch target 36x36pt

**Provider Color Palettes:**

**Gemini (Google):**
- Primary Accent: Google Blue (#1a73e8) for primary CTAs, send button fill, Run button, selected states
- Accent Soft: Light Blue (#e8f0fe) for pill backgrounds, send/attach button containers in light mode
- Accent Muted: (#d2e3fc) for hover/active states
- Accent on Dark: (#8ab4f8) for accent in dark mode

**Claude (Anthropic):**
- Primary Accent: Terracotta Orange (#b3541e) for primary CTAs, send button fill, Run button, selected states
- Accent Soft: Light Warm (#f6ddc8) for pill backgrounds, send/attach button containers
- Accent Muted: (#f0d4bf) for hover/active states
- Accent on Dark: (#f2b07f) for accent in dark mode

**Shared:**
- Text Primary: (#12131a) light / (#f5f7fb) dark
- Text Muted: (#6b7280) light / (#9aa3b2) dark
- Surface/Border: Use theme.borderColor, theme.surfaceBg
- Success (running state): (#16a34a) light / (#22c55e) dark
- Danger (terminate): (#dc2626) light / (#f87171) dark

**Page Structure - Chat Page Buttons (in order of prominence):**

1. **Header Buttons (App header):**
   - Settings gear icon
   - Sidebar toggle icon
   - Each: 40x40pt, rounded 20pt, surface background, subtle border, light shadow. Icon uses theme.textPrimary.

2. **Input Panel - Bottom Row:**
   - **Attach (+):** Circular 36x36pt. Gemini: light accent background (#e8f0fe) + border. Claude: black (#000) background, white "+".
   - **Model Selector:** Text + chevron, muted color; opens modal on tap.
   - **Web Preview (Globe):** 36x36pt, rounded 10pt, subtle gray background, globe icon in textPrimary.
   - **Terminal:** Same as Web Preview. Active state: green border + green dot badge when running.
   - **Terminate Agent (Stop):** Red-tinted secondary button; visible only when agent is running. Red border, red text (#c0392b).
   - **Send:** Circular 36x36pt. Gemini: accent soft background, accent icon. Claude: dark background, accent icon. Disabled: 40% opacity.

3. **Code Reference Pills (above input):**
   - Pill: rounded 12pt, accent soft background.
   - **Remove (x):** Small touch target, muted close icon.

4. **Model Picker Modal:**
   - **Provider Buttons (Claude / Gemini):** Row of two. Each: rounded 10pt, border; selected: accent soft bg + accent border + accent icon.
   - **Model Options:** Vertical list, each row 12pt padding; selected: accent soft bg + accent text.

5. **Message Bubble - Code Block:**
   - **Run Button:** Small primary CTA; accent background, white "Run" text, rounded 6pt, 4pt vertical / 12pt horizontal padding.

**Button Design Requirements:**
- All icon-only buttons: 36x36pt or 40x40pt (header).
- Use provider accent for primary actions (send, run); accent soft for secondary containers.
- Hover/press: opacity 0.85 or scale 0.96.
- Ensure 4.5:1 contrast for text on backgrounds (WCAG AA).
- Provide SVG/PNG assets at 1x, 2x, 3x for icons if generating downloadable assets.

**Output:**
- For redesign: Updated React Native StyleSheet definitions or component props for each button.
- For download: One ZIP containing all button states (default, pressed, disabled) per provider (Gemini/Claude) and per light/dark mode.
```

---

## Icon Mapping (icon-design)

| Location | Button | Suggested Icon (Lucide semantic) |
|----------|--------|----------------------------------|
| Header | Settings | `settings` |
| Header | Sidebar toggle | `menu` |
| Input | Attach | `plus` |
| Input | Model selector chevron | `chevron-down` |
| Input | Web preview | `globe` |
| Input | Terminal | `terminal` |
| Input | Terminate agent | `stop-circle` |
| Input | Send | provider-specific send glyph |
| Pills | Remove | `x` |
| Message | Run | `play` + text |

---

## Provider Brand Icons (llm-icon-finder, verified URLs)

Current lobe-icons path is split by package:
- SVG: `packages/static-svg/icons/*`
- PNG: `packages/static-png/{light|dark}/*`
- WEBP: `packages/static-webp/{light|dark}/*`

### Gemini
- SVG mono: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/gemini.svg`
- SVG color: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/gemini-color.svg`
- PNG light: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-png/light/gemini.png`
- PNG dark: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-png/dark/gemini.png`
- WEBP light: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-webp/light/gemini.webp`
- WEBP dark: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-webp/dark/gemini.webp`
- Browser preview: `https://lobehub.com/icons/gemini`

### Claude
- SVG mono: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/claude.svg`
- SVG color: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/claude-color.svg`
- PNG light: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-png/light/claude.png`
- PNG dark: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-png/dark/claude.png`
- WEBP light: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-webp/light/claude.webp`
- WEBP dark: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-webp/dark/claude.webp`
- Browser preview: `https://lobehub.com/icons/claude`

---

## Local Downloaded Assets

Downloaded files are in:
- `apps/mobile/assets/icons/providers`

Included:
- `gemini.svg`
- `gemini-color.svg`
- `gemini-light.png`
- `gemini-dark.png`
- `gemini-light.webp`
- `gemini-dark.webp`
- `claude.svg`
- `claude-color.svg`
- `claude-light.png`
- `claude-dark.png`
- `claude-light.webp`
- `claude-dark.webp`

---

## How to Use This Prompt

- **UI / design:** Use the “Enhanced Prompt” and “Icon Mapping” sections for button/theme work and asset generation (Gemini & Claude).
- **Claude component (implementation):** Use the “Claude Component – Implementation Requirements” section (items 1–4) for Chat UI parsing, terminal permission/logging, file hyperlinks, and workspace selection redesign. Implement in order or in parallel; add unit tests for §1 and ensure logs and flags are verified for §2.
