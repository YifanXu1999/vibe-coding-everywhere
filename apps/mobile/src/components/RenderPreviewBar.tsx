import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { theme } from "../theme";
import type { PendingRender } from "../hooks/useSocket";

interface RenderPreviewBarProps {
  pendingRender: PendingRender | null;
  /** True only after command has been run and server acknowledged. Preview is allowed only when true. */
  hasRunCommandForCurrentRender: boolean;
  /** Open preview URL in-app (WebView modal) — integrated with chat. */
  onOpenPreviewInApp: (url: string) => void;
}

export function RenderPreviewBar({
  pendingRender,
  hasRunCommandForCurrentRender,
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

  const handlePreviewOnly = () => {
    const url = editedUrl.trim();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4e3ee01c-fe3e-4a44-9e7a-dacd3fdcc465',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderPreviewBar.tsx:handlePreviewOnly',message:'Preview clicked',data:{url:!!url,hasRunCommandForCurrentRender,hypothesisId:'H1'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!url) return;
    if (!hasRunCommandForCurrentRender) return; // User must run command first
    onOpenPreviewInApp(url);
  };

  const canPreview = hasRunCommandForCurrentRender && editedUrl.trim().length > 0;

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
        <TouchableOpacity
          style={[styles.btn, !canPreview && styles.btnDisabled]}
          onPress={handlePreviewOnly}
          activeOpacity={0.8}
          disabled={!canPreview}
        >
          <Text style={[styles.btnText, !canPreview && styles.btnTextDisabled]}>Preview</Text>
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
  btnDisabled: {
    opacity: 0.5,
    backgroundColor: theme.borderColor,
    borderColor: theme.borderColor,
  },
  btnTextDisabled: {
    color: theme.textMuted,
  },
});
