import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Linking, Pressable, Alert, ScrollView } from "react-native";
import Markdown from "react-native-markdown-display";
import { useTheme } from "../../theme/index";
import type { Message } from "../../services/socket/hooks";
import { stripTrailingIncompleteTag } from "../../services/providers/stream";
import { PlayIcon } from "../icons/ChatActionIcons";
import { GeminiIcon, ClaudeIcon, CodexIcon } from "../icons/ProviderIcons";

function getFileName(path: string): string {
  const parts = path.replace(/\/$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

const BASH_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

/** Lines that are prose/headings, not runnable shell commands. Full command chain must be pure commands only. */
const NON_COMMAND_LINE_REGEX =
  /^\s*(#{2,}\s+.*|\*\*[^*]*\*\*\s*$|Command\s+execution\s+summary\s*$|Full\s+command\s+chain\s*\(.*\)\s*$|Terminal\s+\d+:\s*.*)$/i;

/** True if the trimmed line looks like prose (e.g. ends with period). Shell commands are not sentences. */
function looksLikeProse(trimmed: string): boolean {
  if (!trimmed) return false;
  return trimmed.endsWith(".");
}

/** Match "Terminal N: ..." section headers that must not appear inside a code block (log has one; UI must not show twice). */
const TERMINAL_HEADER_LINE_REGEX = /^\s*Terminal\s+\d+:\s*.+$/i;

/** Remove trailing lines that are "Terminal N: ..." from code block content so they are only shown as markdown, not inside the block. */
function stripTrailingTerminalHeaderLines(content: string): string {
  const lines = content.split(/\r?\n/);
  let last = lines.length;
  while (last > 0 && TERMINAL_HEADER_LINE_REGEX.test(lines[last - 1]?.trim() ?? "")) last--;
  return lines.slice(0, last).join("\n").trimEnd();
}

/**
 * Extract runnable command only from a bash code block that may contain mixed content
 * (headings, "Command execution summary", or build-output prose). Ensures the full command chain
 * passed to the shell is pure commands only to avoid e.g. zsh "unmatched `" from prose with backticks.
 */
export function extractBashCommandOnly(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const commandLines: string[] = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (started) commandLines.push(line);
      continue;
    }
    const isNonCommand = NON_COMMAND_LINE_REGEX.test(t) || looksLikeProse(t);
    if (!started) {
      if (!isNonCommand) started = true;
      else continue;
    }
    if (isNonCommand) break;
    commandLines.push(line);
  }
  return commandLines.join("\n").trim();
}

/**
 * Match http/https URLs (exclude trailing punctuation; allow dots in path e.g. .html, and : for port e.g. :5174).
 * Renders according to output-enhancement prompt: prompts/output-enhancement/url.txt
 */
const URL_REGEX = /https?:\/\/[^\s\]\)\}\"']+?(?=[,;)\]}\s]|$)/g;

const LINK_PLACEHOLDER_PREFIX = "\u200B\u200BLINK";
const LINK_PLACEHOLDER_SUFFIX = "\u200B\u200B";
const FILE_ACTIVITY_LINK_REGEX = /^(📝\s*Writing|✏️\s*Editing|📖\s*Reading)\s+\[([^\]]+)\]\(file:([^)]+)\)\s*$/;

type FileActivitySegment =
  | { kind: "file"; prefix: string; fileName: string; path: string }
  | { kind: "text"; text: string };

function parseFileActivitySegments(content: string): FileActivitySegment[] {
  const lines = content.split(/\r?\n/);
  return lines.map((line) => {
    const match = line.match(FILE_ACTIVITY_LINK_REGEX);
    if (!match) return { kind: "text", text: line };
    const prefix = match[1] ?? "";
    const rawName = (match[2] ?? "").trim();
    const fileName = rawName.replace(/^`(.+)`$/, "$1");
    const encodedPath = (match[3] ?? "").trim();
    let path = encodedPath;
    try {
      path = decodeURIComponent(encodedPath);
    } catch {
      // Keep original path when decode fails for malformed legacy links.
    }
    return { kind: "file", prefix, fileName, path };
  });
}

/** Wrap bare URLs in markdown link syntax so they render underlined and tappable. Preserves existing [text](url) links. */
function wrapBareUrlsInMarkdown(content: string): string {
  const existingLinks: Array<{ text: string; url: string }> = [];
  // Replace entire [text](url) so the link text (which may be a URL) is not wrapped again as a bare URL.
  const stripped = content.replace(/\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g, (_, text, url) => {
    const idx = existingLinks.length;
    existingLinks.push({ text, url });
    return LINK_PLACEHOLDER_PREFIX + idx + LINK_PLACEHOLDER_SUFFIX;
  });
  const withWrapped = stripped.replace(URL_REGEX, (url) => `[${url}](${url})`);
  return withWrapped.replace(
    new RegExp(LINK_PLACEHOLDER_PREFIX + "(\\d+)" + LINK_PLACEHOLDER_SUFFIX, "g"),
    (_, i) => {
      const { text, url } = existingLinks[Number(i)];
      return `[${text}](${url})`;
    }
  );
}

/** Matches file-activity lines from formatToolUseForDisplay (Writing, Reading, Editing). */
export function hasFileActivityContent(content: string | null | undefined): boolean {
  if (!content || typeof content !== "string") return false;
  return (
    /📝\s*Writing|✏️\s*Editing|📖\s*Reading/.test(content) ||
    /Writing\s*`|Editing\s*`|Reading\s*`/.test(content)
  );
}

interface MessageBubbleProps {
  message: Message;
  /** When true, the bubble content is the "Terminated" label (muted style). */
  isTerminatedLabel?: boolean;
  /** When true and assistant content, show content in a small scrollable tail box (max height from tailBoxMaxHeight). */
  showAsTailBox?: boolean;
  /** Max height for the tail box (e.g. half screen). Only used when showAsTailBox is true. */
  tailBoxMaxHeight?: number;
  /** AI provider for assistant messages; shows Gemini, Claude, or Codex icon when set. */
  provider?: "claude" | "gemini" | "codex";
  /** When provided, bash code blocks are tappable; user can choose to run the command in a new terminal. */
  onRunBashCommand?: (command: string) => void;
  /** When provided, links (including bare URLs) open in the app's internal browser instead of external. */
  onOpenUrl?: (url: string) => void;
  /** When provided, file: links (from Writing/Editing/Reading) open the file in explorer. */
  onFileSelect?: (path: string) => void;
}

export function MessageBubble({ message, isTerminatedLabel, showAsTailBox, tailBoxMaxHeight = 360, provider, onRunBashCommand, onOpenUrl, onFileSelect }: MessageBubbleProps) {
  const theme = useTheme();
  const useWarmTone = provider === "claude";
  const useCodexTone = provider === "codex";
  const codeBlockBg = useWarmTone ? "#f0ebe4" : useCodexTone ? "#d1fae5" : theme.surfaceBg;
  const quoteBg = useWarmTone ? "#f5f0ea" : useCodexTone ? "#ecfdf5" : theme.cardBg;
  const bashHeaderBg = useWarmTone ? "#e8e2da" : useCodexTone ? "#a7f3d0" : theme.surfaceBg;
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const refs = message.codeReferences ?? [];
  const tailScrollRef = useRef<ScrollView>(null);
  const markdownStyles = useMemo(
    () => ({
      body: { color: theme.textPrimary },
      text: { fontSize: 15, lineHeight: 22, color: theme.textPrimary },
      paragraph: { marginTop: 6, marginBottom: 6 },
      heading1: { fontSize: 20 },
      heading2: { fontSize: 18 },
      heading3: { fontSize: 16 },
      heading4: { fontSize: 15 },
      heading5: { fontSize: 14 },
      heading6: { fontSize: 13 },
      link: { color: theme.accent, textDecorationLine: "underline" as const },
      code_inline: { backgroundColor: codeBlockBg, color: theme.textPrimary },
      code_block: { backgroundColor: codeBlockBg, color: theme.textPrimary },
      fence: { backgroundColor: codeBlockBg, color: theme.textPrimary },
      blockquote: { backgroundColor: quoteBg, borderColor: theme.borderColor },
    }),
    [theme, codeBlockBg, quoteBg]
  );
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: "row" as const, alignItems: "flex-start", gap: 14 },
        rowUser: { flexDirection: "row" as const, justifyContent: "flex-end" },
        providerIconWrap: { width: 24, height: 24 },
        bubble: {
          paddingVertical: 16,
          paddingHorizontal: 18,
          borderRadius: 18,
          maxWidth: "80%",
          backgroundColor: "transparent",
        },
        bubbleUser: {
          borderWidth: 1,
          borderColor: theme.borderColor,
          backgroundColor: theme.mode === "dark" ? "#2a2e38" : "#e8e9ef",
        },
        bubbleSystem: {},
        bubbleText: { fontSize: 15, lineHeight: 22, color: theme.textPrimary },
        bubbleTextSystem: { fontSize: 13, color: theme.textMuted },
        bubbleTextTerminated: { color: theme.textMuted, fontStyle: "italic" as const },
        bubbleTextPlaceholder: { color: theme.textMuted, fontStyle: "italic" as const },
        fileActivityLine: { marginTop: 4, marginBottom: 4 },
        fileActivityFileName: { color: theme.textPrimary, fontWeight: "600" as const },
        tailBoxScroll: { flexGrow: 0 },
        tailBoxContent: { paddingBottom: 12 },
        refPills: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
        refPillsWithContent: { marginTop: 10 },
        refPill: {
          flexDirection: "row" as const,
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 12,
          backgroundColor: theme.accentLight,
        },
        refPillIcon: { fontSize: 12, color: theme.accent },
        refPillText: { fontSize: 13, color: theme.textPrimary, fontWeight: "500" as const },
        bashCodeBlockWrapper: {
          alignSelf: "stretch",
          marginVertical: 4,
          borderRadius: 8,
          overflow: "hidden" as const,
          backgroundColor: codeBlockBg,
          borderWidth: 1,
          borderColor: theme.borderColor,
        },
        bashCodeBlockHeader: {
          flexDirection: "row" as const,
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderColor,
          backgroundColor: bashHeaderBg,
        },
        bashCodeBlockHeaderSpacer: { flex: 1 },
        bashRunButton: {
          flexDirection: "row" as const,
          alignItems: "center",
          gap: 4,
          paddingVertical: 4,
          paddingHorizontal: 12,
          borderRadius: 6,
          backgroundColor: theme.accent,
        },
        bashRunButtonPressed: { opacity: 0.85 },
        bashRunButtonText: { fontSize: 13, fontWeight: "600" as const, color: "#fff" },
        bashCodeBlock: { paddingHorizontal: 12, paddingVertical: 10 },
      }),
    [theme, codeBlockBg, bashHeaderBg]
  );

  useEffect(() => {
    if (showAsTailBox && message.content) {
      tailScrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [showAsTailBox, message.content]);

  const handleMarkdownLinkPress = useCallback(
    (url: string): boolean => {
      if (url.startsWith("file:")) {
        const encodedPath = url.slice(5);
        let path = encodedPath;
        try {
          path = decodeURIComponent(encodedPath);
        } catch {
          // Backward compatibility for older unencoded or malformed file: links.
        }
        onFileSelect?.(path);
        return false;
      }
      if (onOpenUrl) {
        onOpenUrl(url);
        return false;
      }
      Linking.openURL(url);
      return false;
    },
    [onFileSelect, onOpenUrl]
  );

  const sanitizedContent = useMemo(
    () => stripTrailingIncompleteTag(message.content ?? ""),
    [message.content]
  );
  const fileActivitySegments = useMemo(
    () => parseFileActivitySegments(sanitizedContent),
    [sanitizedContent]
  );
  const hasRawFileActivityLinks = useMemo(
    () => fileActivitySegments.some((seg) => seg.kind === "file"),
    [fileActivitySegments]
  );
  const markdownRules = useMemo(() => {
    if (!onRunBashCommand) return undefined;
    return {
      fence: (
        node: { key?: string; content?: string; sourceInfo?: string },
        _children: React.ReactNode,
        _parent: unknown,
        mdStyles: Record<string, unknown>,
        inheritedStyles: Record<string, unknown> = {}
      ) => {
        let content = node.content ?? "";
        if (typeof content === "string" && content.charAt(content.length - 1) === "\n") {
          content = content.substring(0, content.length - 1);
        }
        const lang = (node.sourceInfo ?? "").trim().toLowerCase().split(/\s/)[0] ?? "";
        const isBash = BASH_LANGUAGES.has(lang);
        const handleRunPress = () => {
          const trimmed = String(content).trim();
          if (!trimmed) return;
          const command = extractBashCommandOnly(trimmed) || trimmed;
          Alert.alert(
            "Run command",
            "Open a new terminal and run this command?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Run", onPress: () => onRunBashCommand(command) },
            ]
          );
        };
        const displayContent = isBash
          ? (extractBashCommandOnly(content) || content)
          : stripTrailingTerminalHeaderLines(content);
        const codeBlock = (
          <Text key={node.key} style={[inheritedStyles, mdStyles.fence ?? markdownStyles.fence]}>
            {displayContent}
          </Text>
        );
        if (isBash) {
          return (
            <View key={node.key} style={styles.bashCodeBlockWrapper}>
              <View style={styles.bashCodeBlockHeader}>
                <View style={styles.bashCodeBlockHeaderSpacer} />
                <Pressable
                  onPress={handleRunPress}
                  style={({ pressed }) => [styles.bashRunButton, pressed && styles.bashRunButtonPressed]}
                  hitSlop={8}
                >
                  <PlayIcon size={11} color="#fff" />
                  <Text style={styles.bashRunButtonText}>Run</Text>
                </Pressable>
              </View>
              <View style={styles.bashCodeBlock}>
                {codeBlock}
              </View>
            </View>
          );
        }
        return codeBlock;
      },
    };
  }, [onRunBashCommand, markdownStyles, styles]);

  const renderFileActivityContent = useCallback(
    () => (
      <View>
        {fileActivitySegments.map((seg, index) => {
          if (seg.kind === "file") {
            return (
              <Text key={`file-activity-${index}`} style={[styles.bubbleText, styles.fileActivityLine]}>
                {seg.prefix}{" "}
                <Text style={styles.fileActivityFileName} onPress={() => onFileSelect?.(seg.path)}>
                  {seg.fileName}
                </Text>
              </Text>
            );
          }
          if (!seg.text.trim()) {
            return <View key={`file-activity-space-${index}`} style={styles.fileActivityLine} />;
          }
          return (
            <Markdown
              key={`file-activity-text-${index}`}
              style={markdownStyles}
              mergeStyle
              rules={markdownRules}
              onLinkPress={handleMarkdownLinkPress}
            >
              {wrapBareUrlsInMarkdown(seg.text)}
            </Markdown>
          );
        })}
      </View>
    ),
    [fileActivitySegments, handleMarkdownLinkPress, markdownRules, markdownStyles, onFileSelect, styles]
  );

  const showProviderIcon = !isUser && !isSystem && provider;
  const ProviderIcon =
    provider === "claude" ? ClaudeIcon : provider === "codex" ? CodexIcon : GeminiIcon;

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {showProviderIcon && (
        <View style={styles.providerIconWrap}>
          <ProviderIcon size={24} />
        </View>
      )}
      <View style={[styles.bubble, isUser && styles.bubbleUser, isSystem && styles.bubbleSystem]}>
        {message.content && message.content.trim() !== "" ? (
          isTerminatedLabel ? (
            <Text
              style={[styles.bubbleText, styles.bubbleTextTerminated]}
              selectable={false}
            >
              {message.content}
            </Text>
          ) : isUser || isSystem ? (
            <Text
              style={[
                styles.bubbleText,
                isSystem && styles.bubbleTextSystem,
              ]}
              selectable
            >
              {message.content}
            </Text>
          ) : showAsTailBox ? (
            <ScrollView
              ref={tailScrollRef}
              style={[styles.tailBoxScroll, { maxHeight: tailBoxMaxHeight }]}
              contentContainerStyle={styles.tailBoxContent}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
            >
              {hasRawFileActivityLinks ? (
                renderFileActivityContent()
              ) : (
                <Markdown
                  style={markdownStyles}
                  mergeStyle
                  rules={markdownRules}
                  onLinkPress={handleMarkdownLinkPress}
                >
                  {wrapBareUrlsInMarkdown(sanitizedContent)}
                </Markdown>
              )}
            </ScrollView>
          ) : (
            hasRawFileActivityLinks ? (
              renderFileActivityContent()
            ) : (
              <Markdown
                style={markdownStyles}
                mergeStyle
                rules={markdownRules}
                onLinkPress={handleMarkdownLinkPress}
              >
                {wrapBareUrlsInMarkdown(sanitizedContent)}
              </Markdown>
            )
          )
        ) : !isUser && !isSystem ? (
          <Text style={[styles.bubbleText, styles.bubbleTextPlaceholder]} selectable={false}>
            …
          </Text>
        ) : null}
        {refs.length > 0 && (
          <View style={[styles.refPills, message.content ? styles.refPillsWithContent : null]}>
            {refs.map((ref, index) => (
              <View key={`${ref.path}-${ref.startLine}-${index}`} style={styles.refPill}>
                <Text style={styles.refPillIcon}>◇</Text>
                <Text style={styles.refPillText} numberOfLines={1}>
                  {getFileName(ref.path)} ({ref.startLine === ref.endLine ? ref.startLine : `${ref.startLine}-${ref.endLine}`})
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

