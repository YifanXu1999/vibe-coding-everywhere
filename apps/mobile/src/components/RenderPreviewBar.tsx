import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { theme } from "../theme";
import type { PendingRender } from "../hooks/useSocket";

interface RenderPreviewBarProps {
  pendingRender: PendingRender | null;
  onRunRender: (command: string, url: string) => void;
  /** Open preview URL in-app (WebView modal) — integrated with chat. */
  onOpenPreviewInApp: (url: string) => void;
}

export function RenderPreviewBar({
  pendingRender,
  onRunRender,
  onOpenPreviewInApp,
}: RenderPreviewBarProps) {
  const [editedCommand, setEditedCommand] = useState("");
  const [editedUrl, setEditedUrl] = useState("");

  useEffect(() => {
    if (pendingRender) {
      setEditedCommand(pendingRender.command ?? "");
      setEditedUrl(pendingRender.url ?? "");
    }
  }, [pendingRender?.command, pendingRender?.url]);

  if (!pendingRender) return null;

  const handleRunOnly = () => {
    onRunRender(editedCommand.trim(), editedUrl.trim());
  };

  const handlePreviewOnly = () => {
    const url = editedUrl.trim();
    if (url) onOpenPreviewInApp(url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.label}>Command:</Text>
        <TextInput
          style={styles.commandInput}
          value={editedCommand}
          onChangeText={setEditedCommand}
          placeholder="Command to run..."
          placeholderTextColor={theme.textMuted}
          multiline
        />
        <Text style={styles.label}>URL:</Text>
        <TextInput
          style={styles.urlInput}
          value={editedUrl}
          onChangeText={setEditedUrl}
          placeholder="Preview URL (e.g. http://localhost:53721/red.html)"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btnSecondary} onPress={handleRunOnly} activeOpacity={0.8}>
          <Text style={styles.btnSecondaryText}>Run command</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handlePreviewOnly} activeOpacity={0.8}>
          <Text style={styles.btnText}>Preview</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.accentLight,
    borderRadius: 14,
    padding: 16,
  },
  content: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textMuted,
  },
  commandInput: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.borderColor,
    color: theme.textPrimary,
    minHeight: 40,
    maxHeight: 100,
  },
  urlInput: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.borderColor,
    color: theme.textPrimary,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap",
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  btnText: {
    color: "#fff",
    fontWeight: "500",
    fontSize: 14,
  },
  btnSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: "transparent",
  },
  btnSecondaryText: {
    color: theme.accent,
    fontWeight: "500",
    fontSize: 14,
  },
});
