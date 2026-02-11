import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";
import type { Message } from "../hooks/useSocket";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const avatarText = message.role === "assistant" ? "C" : message.role === "user" ? "You" : "!";

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {!isUser && (
        <View style={[styles.avatar, isUser && styles.avatarUser]}>
          <Text style={[styles.avatarText, isUser && styles.avatarTextUser]}>{avatarText}</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser && styles.bubbleUser, isSystem && styles.bubbleSystem]}>
        <Text style={[styles.bubbleText, isSystem && styles.bubbleTextSystem]} selectable>
          {message.content}
        </Text>
      </View>
      {isUser && (
        <View style={[styles.avatar, styles.avatarUser]}>
          <Text style={styles.avatarTextUser}>{avatarText}</Text>
        </View>
      )}
    </View>
  );
}

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
});
