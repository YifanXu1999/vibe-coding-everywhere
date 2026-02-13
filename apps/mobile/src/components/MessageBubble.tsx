import React, { useMemo } from "react";
import { View, Text, StyleSheet, Linking, Pressable, Alert } from "react-native";
import Markdown from "react-native-markdown-display";
import { theme } from "../theme";
import type { Message } from "../hooks/useSocket";

function getFileName(path: string): string {
  const parts = path.replace(/\/$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

const BASH_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

/**
 * Match http/https URLs (exclude trailing punctuation, but allow dots in path e.g. .html).
 * Renders according to output-enhancement prompt: prompts/output-enhancement/url.txt
 * (e.g. "Access the page at:" then URL on next line, or URL on its own line → shown as tappable link).
 */
const URL_REGEX = /https?:\/\/[^\s\]\)\}\"']+?(?=[,;:)\]}\s]|$)/g;

/** Wrap bare URLs in markdown link syntax so they render underlined and tappable. Preserves existing [text](url) links. */
function wrapBareUrlsInMarkdown(content: string): string {
  const existingLinks: string[] = [];
  const stripped = content.replace(/\]\((https?:\/\/[^\)]+)\)/g, (_, url) => {
    existingLinks.push(url);
    return "]\u200B(" + (existingLinks.length - 1) + ")";
  });
  const withWrapped = stripped.replace(URL_REGEX, (url) => `[${url}](${url})`);
  return withWrapped.replace(/\]\u200B\((\d+)\)/g, (_, i) => "](" + existingLinks[Number(i)] + ")");
}

interface MessageBubbleProps {
  message: Message;
  /** When true, the bubble content is the "Terminated" label (muted style). */
  isTerminatedLabel?: boolean;
  /** When provided, bash code blocks are tappable; user can choose to run the command in a new terminal. */
  onRunBashCommand?: (command: string) => void;
  /** When provided, links (including bare URLs) open in the app's internal browser instead of external. */
  onOpenUrl?: (url: string) => void;
}

export function MessageBubble({ message, isTerminatedLabel, onRunBashCommand, onOpenUrl }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const avatarText = message.role === "assistant" ? "C" : message.role === "user" ? "You" : "!";
  const refs = message.codeReferences ?? [];

  const markdownRules = useMemo(() => {
    const rules: Record<string, React.ComponentType<any>> = {};
    // Custom link rule: use full href from AST and open in internal browser when onOpenUrl provided
    if (onOpenUrl) {
      rules.link = (
        node: { key?: string; attributes?: { href?: string } },
        children: React.ReactNode,
        _parent: unknown,
        styles: Record<string, unknown>
      ) => {
        const href = (node.attributes?.href ?? "").trim();
        return (
          <Pressable
            key={node.key}
            onPress={() => href && onOpenUrl(href)}
            style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
          >
            <Text style={[markdownStyles.link]}>{children}</Text>
          </Pressable>
        );
      };
    }
    if (onRunBashCommand) {
      rules.fence = (
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
          Alert.alert(
            "Run command",
            "Open a new terminal and run this command?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Run", onPress: () => onRunBashCommand(trimmed) },
            ]
          );
        };
        const codeBlock = (
          <Text key={node.key} style={[inheritedStyles, mdStyles.fence ?? markdownStyles.fence]}>
            {content}
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
      };
    }
    return Object.keys(rules).length > 0 ? rules : undefined;
  }, [onRunBashCommand, onOpenUrl]);

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {!isUser && (
        <View style={[styles.avatar, isUser && styles.avatarUser]}>
          <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>{avatarText}</Text>
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
          ) : (
            <Markdown
              style={markdownStyles}
              mergeStyle
              rules={markdownRules}
              onLinkPress={(url) => {
                if (onOpenUrl) {
                  onOpenUrl(url);
                  return false;
                }
                Linking.openURL(url);
                return false;
              }}
            >
              {wrapBareUrlsInMarkdown(message.content)}
            </Markdown>
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
      {isUser && (
        <View style={[styles.avatar, styles.avatarUser]}>
          <Text style={styles.avatarTextUser}>{avatarText}</Text>
        </View>
      )}
    </View>
  );
}

const markdownStyles = {
  body: { color: theme.textPrimary },
  text: { fontSize: 15, lineHeight: 22, color: theme.textPrimary },
  paragraph: { marginTop: 6, marginBottom: 6 },
  heading1: { fontSize: 20 },
  heading2: { fontSize: 18 },
  heading3: { fontSize: 16 },
  heading4: { fontSize: 15 },
  heading5: { fontSize: 14 },
  heading6: { fontSize: 13 },
  link: { color: theme.accent, textDecorationLine: "underline" },
  code_inline: { backgroundColor: "#f0ebe4", color: theme.textPrimary },
  code_block: { backgroundColor: "#f0ebe4", color: theme.textPrimary },
  fence: { backgroundColor: "#f0ebe4", color: theme.textPrimary },
  blockquote: { backgroundColor: "#f5f0ea", borderColor: theme.borderColor },
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  rowUser: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUser: {
    backgroundColor: "#000",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.accent,
  },
  avatarTextUser: {
    color: "#fff",
  },
  bubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.borderColor,
    maxWidth: "80%",
    backgroundColor: theme.assistantBg,
  },
  bubbleUser: {
    backgroundColor: theme.userBg,
    borderColor: "#f0d8c6",
  },
  bubbleSystem: {
    backgroundColor: "#fff4e4",
    borderStyle: "dashed",
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.textPrimary,
  },
  bubbleTextSystem: {
    fontSize: 13,
    color: theme.textMuted,
  },
  bubbleTextTerminated: {
    color: theme.textMuted,
    fontStyle: "italic",
  },
  bubbleTextPlaceholder: {
    color: theme.textMuted,
    fontStyle: "italic",
  },
  refPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  refPillsWithContent: {
    marginTop: 10,
  },
  refPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#e8f0fe",
  },
  refPillIcon: {
    fontSize: 12,
    color: "#4078F2",
  },
  refPillText: {
    fontSize: 13,
    color: theme.textPrimary,
    fontWeight: "500",
  },
  bashCodeBlockWrapper: {
    alignSelf: "stretch",
    marginVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f0ebe4",
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  bashCodeBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor,
    backgroundColor: "#e8e2da",
  },
  bashCodeBlockHeaderSpacer: {
    flex: 1,
  },
  bashRunButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: theme.accent,
  },
  bashRunButtonPressed: {
    opacity: 0.85,
  },
  bashRunButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  bashCodeBlock: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
