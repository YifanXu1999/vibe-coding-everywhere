import React, { useState, useCallback } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { theme } from "../theme";

const DEFAULT_PLACEHOLDER = "How can I help you today?";
const INPUT_PLACEHOLDER = "Type response for Claude…";

export type PendingCodeRef = {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
};

function getFileName(path: string): string {
  const parts = path.replace(/\/$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

export interface InputPanelProps {
  connected: boolean;
  claudeRunning: boolean;
  waitingForUserInput: boolean;
  permissionMode: string | null;
  onPermissionModeChange: (mode: string) => void;
  onSubmit: (prompt: string, permissionMode?: string) => void;
  pendingCodeRefs?: PendingCodeRef[];
  onRemoveCodeRef?: (index: number) => void;
  /** When true, show green dot on terminal button (run output exists). */
  showTerminalButton?: boolean;
  /** Running state: show green dot on terminal button. */
  runProcessActive?: boolean;
  onShowTerminal?: () => void;
  /** Open full-screen terminal. Button is shown beside model name (Sonnet 4.5). */
  onOpenTerminal?: () => void;
  /** When agent is running, show a control to terminate the response. */
  onTerminateAgent?: () => void;
}

export function InputPanel({
  connected,
  claudeRunning,
  waitingForUserInput,
  permissionMode,
  onPermissionModeChange,
  onSubmit,
  pendingCodeRefs = [],
  onRemoveCodeRef,
  showTerminalButton = false,
  runProcessActive = false,
  onShowTerminal,
  onOpenTerminal,
  onTerminateAgent,
}: InputPanelProps) {
  const [prompt, setPrompt] = useState("");

  const disabled = !waitingForUserInput && claudeRunning;
  const placeholder = waitingForUserInput ? INPUT_PLACEHOLDER : DEFAULT_PLACEHOLDER;

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed && !pendingCodeRefs.length) return;
    if (waitingForUserInput && claudeRunning) {
      onSubmit(trimmed, permissionMode ?? undefined);
      setPrompt("");
      return;
    }
    if (claudeRunning) return;
    onSubmit(trimmed || "See code references below.", permissionMode ?? undefined);
    setPrompt("");
  }, [prompt, pendingCodeRefs.length, waitingForUserInput, claudeRunning, permissionMode, onSubmit]);

  return (
    <KeyboardAvoidingView
      behavior={Platform?.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform?.OS === "ios" ? 90 : 0}
    >
      <View style={styles.container}>
        {pendingCodeRefs.length > 0 && (
          <View style={styles.refPills}>
            {pendingCodeRefs.map((ref, index) => (
              <View key={`${ref.path}-${ref.startLine}-${index}`} style={styles.refPill}>
                <Text style={styles.refPillText} numberOfLines={1}>
                  {getFileName(ref.path)} ({ref.startLine === ref.endLine ? ref.startLine : `${ref.startLine}-${ref.endLine}`})
                </Text>
                {onRemoveCodeRef && (
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => onRemoveCodeRef(index)}
                    style={styles.refPillRemove}
                  >
                    <Text style={styles.refPillRemoveText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
        <View style={styles.topRow}>
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
          <View style={[styles.statusDot, connected && styles.statusDotConnected]} />
        </View>
        <View style={styles.bottomRow}>
          <TouchableOpacity style={styles.btnAttach} activeOpacity={0.8}>
            <Text style={styles.btnAttachText}>+</Text>
          </TouchableOpacity>
          <View style={styles.modelSelector}>
            <Text style={styles.modelName}>Sonnet 4.5</Text>
            <Text style={styles.chevron}>▼</Text>
          </View>
          {onOpenTerminal && (
            <TouchableOpacity
              style={[styles.btnTerminal, runProcessActive && styles.btnTerminalActive]}
              onPress={onOpenTerminal}
              activeOpacity={0.8}
              accessibilityLabel="Open terminal"
            >
              <Text style={styles.btnTerminalText}>⌘</Text>
              {runProcessActive && <View style={styles.terminalRunningDot} />}
            </TouchableOpacity>
          )}
          {onTerminateAgent && claudeRunning && (
            <TouchableOpacity
              style={styles.btnTerminateAgent}
              onPress={onTerminateAgent}
              activeOpacity={0.8}
              accessibilityLabel="Terminate agent response"
            >
              <Text style={styles.btnTerminateAgentText}>Stop</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btnSend, disabled && styles.btnSendDisabled]}
            onPress={handleSubmit}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../assets/send-button.png")}
              style={styles.sendButtonIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    gap: 12,
    borderWidth: 1,
    borderColor: theme.borderColor,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.surfaceBg,
  },
  refPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  refPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 12,
    backgroundColor: "#e8f0fe",
    maxWidth: "100%",
  },
  refPillText: {
    fontSize: 13,
    color: theme.textPrimary,
    fontWeight: "500",
  },
  refPillRemove: {
    padding: 2,
  },
  refPillRemoveText: {
    fontSize: 18,
    color: theme.textMuted,
    lineHeight: 20,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 28,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.textPrimary,
    padding: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#c5c5c5",
  },
  statusDotConnected: {
    backgroundColor: theme.success,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  btnAttach: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  btnAttachText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "300",
    lineHeight: 22,
  },
  modelSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: "auto",
  },
  modelName: {
    fontSize: 14,
    color: theme.textMuted,
    fontWeight: "500",
  },
  chevron: {
    fontSize: 10,
    color: theme.textMuted,
  },
  btnTerminal: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: theme.borderColor,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  btnTerminalActive: {
    borderColor: theme.success,
  },
  btnTerminalText: {
    fontSize: 18,
    color: theme.textPrimary,
  },
  terminalRunningDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.success,
  },
  btnTerminateAgent: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(200, 60, 60, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(200, 60, 60, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnTerminateAgentText: {
    fontSize: 14,
    color: "#c0392b",
    fontWeight: "600",
  },
  btnSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSendDisabled: {
    opacity: 0.4,
  },
  sendButtonIcon: {
    width: 36,
    height: 36,
  },
  waveformIcon: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    height: 16,
  },
  waveformBar: {
    width: 3,
    backgroundColor: theme.textMuted,
    borderRadius: 2,
  },
  waveformBarShort: {
    height: 8,
  },
  waveformBarMid: {
    height: 12,
  },
  waveformBarTall: {
    height: 14,
  },
  btnSendText: {
    color: theme.textMuted,
    fontSize: 14,
  },
});
