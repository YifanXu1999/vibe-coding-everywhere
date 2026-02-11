import React, { useState, useCallback } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { theme } from "../theme";

const DEFAULT_PLACEHOLDER = "Reply...";
const INPUT_PLACEHOLDER = "Type response for Claude…";

interface InputPanelProps {
  connected: boolean;
  claudeRunning: boolean;
  waitingForUserInput: boolean;
  permissionMode: string | null;
  onPermissionModeChange: (mode: string) => void;
  onSubmit: (prompt: string, permissionMode?: string) => void;
}

export function InputPanel({
  connected,
  claudeRunning,
  waitingForUserInput,
  permissionMode,
  onPermissionModeChange,
  onSubmit,
}: InputPanelProps) {
  const [prompt, setPrompt] = useState("");

  const disabled = !waitingForUserInput && claudeRunning;
  const placeholder = waitingForUserInput ? INPUT_PLACEHOLDER : DEFAULT_PLACEHOLDER;

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (waitingForUserInput && claudeRunning) {
      onSubmit(trimmed, permissionMode ?? undefined);
      setPrompt("");
      return;
    }
    if (claudeRunning) return;
    onSubmit(trimmed, permissionMode ?? undefined);
    setPrompt("");
  }, [prompt, waitingForUserInput, claudeRunning, permissionMode, onSubmit]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.container}>
        <TouchableOpacity style={styles.btnAttach} activeOpacity={0.8}>
          <Text style={styles.btnAttachText}>+</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          editable={!disabled}
          multiline={false}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
        />
        <View style={styles.right}>
          <View style={styles.status}>
            <View style={[styles.statusDot, connected && styles.statusDotConnected]} />
            <Text style={styles.statusLabel}>{connected ? "Online" : "Offline"}</Text>
          </View>
          <View style={styles.permissionWrap}>
            <Text style={styles.permissionLabel}>Permission</Text>
            <View style={styles.permissionRow}>
              <TouchableOpacity
                style={styles.permissionBtn}
                onPress={() => onPermissionModeChange("")}
              >
                <Text style={!permissionMode ? styles.permissionActive : styles.permissionInactive}>
                  Auto
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.permissionBtn}
                onPress={() => onPermissionModeChange("ask")}
              >
                <Text style={permissionMode === "ask" ? styles.permissionActive : styles.permissionInactive}>
                  Ask
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.permissionBtn}
                onPress={() => onPermissionModeChange("auto")}
              >
                <Text style={permissionMode === "auto" ? styles.permissionActive : styles.permissionInactive}>
                  Approve
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.btnSend, disabled && styles.btnSendDisabled]}
            onPress={handleSubmit}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <Text style={styles.btnSendText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: theme.borderColor,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  btnAttach: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.borderColor,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAttachText: {
    fontSize: 18,
    color: theme.textMuted,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.textPrimary,
    padding: 0,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#c5c5c5",
  },
  statusDotConnected: {
    backgroundColor: theme.success,
  },
  statusLabel: {
    fontSize: 13,
    color: theme.textMuted,
  },
  permissionWrap: {
    flexDirection: "column",
  },
  permissionLabel: {
    fontSize: 11,
    color: theme.textMuted,
  },
  permissionRow: {
    flexDirection: "row",
    gap: 4,
  },
  permissionBtn: {
    paddingHorizontal: 6,
  },
  permissionActive: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.accent,
  },
  permissionInactive: {
    fontSize: 13,
    color: theme.textMuted,
  },
  btnSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSendDisabled: {
    opacity: 0.4,
  },
  btnSendText: {
    color: "#fff",
    fontSize: 14,
  },
});
