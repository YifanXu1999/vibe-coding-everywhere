import React from "react";
import { View, Text, StyleSheet, Linking } from "react-native";
import Markdown from "react-native-markdown-display";
import { theme } from "../theme";
import type { Message } from "../hooks/useSocket";

function getFileName(path: string): string {
  const parts = path.replace(/\/$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

interface MessageBubbleProps {
  message: Message;
  /** When true, the bubble content is the "Terminated" label (muted style). */
  isTerminatedLabel?: boolean;
}

export function MessageBubble({ message, isTerminatedLabel }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const avatarText = message.role === "assistant" ? "C" : message.role === "user" ? "You" : "!";
  const refs = message.codeReferences ?? [];

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {!isUser && (
        <View style={[styles.avatar, isUser && styles.avatarUser]}>
          <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>{avatarText}</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser && styles.bubbleUser, isSystem && styles.bubbleSystem]}>
        {message.content ? (
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
              onLinkPress={(url) => {
                Linking.openURL(url);
                return false;
              }}
            >
              {message.content}
            </Markdown>
          )
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
});
