/**
 * Core domain types and small interfaces (Interface Segregation).
 * Components and hooks depend on these abstractions instead of concrete implementations.
 */

/** Code reference for display: file name + lines in chat. */
export type CodeReference = {
  path: string;
  startLine: number;
  endLine: number;
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  codeReferences?: CodeReference[];
};

export type PendingRender = {
  command: string;
  url: string;
};

export type PermissionDenial = {
  tool_name?: string;
  tool?: string;
  tool_input?: { file_path?: string; path?: string };
};

export type LastRunOptions = {
  permissionMode: string | null;
  allowedTools: string[];
  useContinue: boolean;
};

export type TerminalState = {
  id: string;
  pid: number | null;
  lines: { type: "stdout" | "stderr"; text: string }[];
  lastCommand: string | null;
  active: boolean;
  isSingleCommand: boolean;
};

// ─── Interface Segregation: small, focused interfaces ─────────────────────

/** Connection status only. */
export interface IConnectionState {
  connected: boolean;
}

/** Chat messages and typing state. */
export interface IChatState {
  messages: Message[];
  typingIndicator: boolean;
  claudeRunning: boolean;
  waitingForUserInput: boolean;
}

/** Permission denials and last run options. */
export interface IPermissionState {
  permissionDenials: PermissionDenial[] | null;
  lastRunOptions: LastRunOptions;
}

/** Terminal list and selection. */
export interface ITerminalState {
  terminals: TerminalState[];
  selectedTerminalId: string | null;
  setSelectedTerminalId: (id: string | null) => void;
  runOutputLines: { type: "stdout" | "stderr"; text: string }[];
  runCommand: string | null;
  runProcessActive: boolean;
  canRunInSelectedTerminal: boolean;
}

/** Run-render (preview) state. */
export interface IRunRenderState {
  pendingRender: PendingRender | null;
  runRenderResult: { ok: boolean; message: string } | null;
}

/** Server base URL and preview URL resolution. Injected for testability. */
export interface IServerConfig {
  getBaseUrl(): string;
  resolvePreviewUrl(previewUrl: string): string;
}

/** Fetch workspace file content. Injected so App does not hard-code fetch. */
export interface IWorkspaceFileService {
  fetchFile(path: string): Promise<{ content: string | null; isImage: boolean }>;
}

/** Factory to create a socket connection. Enables swapping transport in tests. */
export interface ISocketFactory {
  create(url: string): unknown;
}
