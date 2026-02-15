import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  ScrollView,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../theme/index";

function GlobeIcon({ size = 20, color = "#333" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Path
        fill={color}
        d="M222.35693,161.11682a99.99106,99.99106,0,0,0-.02246-66.2959,3.99577,3.99577,0,0,0-.16308-.46191A100.00019,100.00019,0,0,0,33.83105,94.3512a4.01515,4.01515,0,0,0-.17773.50415,99.99136,99.99136,0,0,0,.03125,66.37927,4.14511,4.14511,0,0,0,.13965.3949,100,100,0,0,0,188.34228.02624A3.96321,3.96321,0,0,0,222.35693,161.11682ZM128,216.03064c-14.43311-13.53882-25.105-31.73706-30.93994-52.03027h61.87988C153.105,184.29358,142.43311,202.49182,128,216.03064ZM95.02979,156.00037a130.90714,130.90714,0,0,1-.00049-56h65.9414a130.90714,130.90714,0,0,1-.00049,56ZM36,128.00037a91.65778,91.65778,0,0,1,4.36182-28H86.76123a143.33386,143.33386,0,0,0,.00049,56H40.36182A91.65787,91.65787,0,0,1,36,128.00037Zm92-88.03028c14.43506,13.53858,25.10693,31.73633,30.94092,52.03028H97.05908C102.89307,71.70642,113.56494,53.50867,128,39.97009Zm41.23877,60.03028h46.39941a92.05165,92.05165,0,0,1,0,56h-46.3999a143.33386,143.33386,0,0,0,.00049-56Zm43.42187-8H167.36426c-5.70655-21.50928-16.53174-40.7439-31.61377-55.67041A92.20548,92.20548,0,0,1,212.66064,92.00037ZM120.24951,36.33c-15.082,14.92651-25.90722,34.16113-31.61377,55.67041H43.33936A92.20548,92.20548,0,0,1,120.24951,36.33ZM43.33936,164.00037H88.63574c5.707,21.50879,16.53174,40.74353,31.61377,55.67041A92.20529,92.20529,0,0,1,43.33936,164.00037Zm92.41113,55.67041c15.082-14.92688,25.90674-34.16162,31.61377-55.67041h45.29638A92.20529,92.20529,0,0,1,135.75049,219.67078Z"
      />
    </Svg>
  );
}

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
  /** Open web preview modal. */
  onOpenWebPreview?: () => void;
  /** Current AI provider (for model selector in input bar). */
  provider?: "claude" | "gemini";
  /** Current model value (e.g. "sonnet", "gemini-2.5-flash"). */
  model?: string;
  /** Model options for current provider: { value, label }[]. */
  modelOptions?: { value: string; label: string }[];
  /** Called when user switches provider (resets model to default). */
  onProviderChange?: (provider: "claude" | "gemini") => void;
  /** Called when user selects a model. */
  onModelChange?: (model: string) => void;
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
  onOpenWebPreview,
  provider = "gemini",
  model = "gemini-2.5-flash",
  modelOptions = [],
  onProviderChange,
  onModelChange,
}: InputPanelProps) {
  const theme = useTheme();
  const [prompt, setPrompt] = useState("");
  const [modelPickerVisible, setModelPickerVisible] = useState(false);

  const currentModelLabel = modelOptions.find((m) => m.value === model)?.label ?? model;

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

  const styles = useMemo(() => createInputPanelStyles(theme), [theme]);

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
          <TouchableOpacity
            style={styles.modelSelector}
            onPress={() => (onProviderChange || onModelChange ? setModelPickerVisible(true) : null)}
            activeOpacity={0.8}
            disabled={!onProviderChange && !onModelChange}
          >
            <Text style={styles.modelName}>{currentModelLabel}</Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>
          {onOpenWebPreview && (
            <TouchableOpacity
              style={styles.btnWebPreview}
              onPress={onOpenWebPreview}
              activeOpacity={0.8}
              accessibilityLabel="Open web preview"
            >
              <GlobeIcon size={20} color={theme.textPrimary} />
            </TouchableOpacity>
          )}
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
              source={require("../../../assets/send-button.png")}
              style={styles.sendButtonIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={modelPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModelPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modelPickerBackdrop}
          activeOpacity={1}
          onPress={() => setModelPickerVisible(false)}
        >
          <View style={styles.modelPickerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modelPickerTitle}>Provider</Text>
            <View style={styles.modelPickerProviderRow}>
              <TouchableOpacity
                style={[styles.modelPickerProviderBtn, provider === "claude" && styles.modelPickerProviderBtnActive]}
                onPress={() => onProviderChange?.("claude")}
                activeOpacity={0.8}
              >
                <Text style={[styles.modelPickerProviderText, provider === "claude" && styles.modelPickerProviderTextActive]}>Claude</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modelPickerProviderBtn, provider === "gemini" && styles.modelPickerProviderBtnActive]}
                onPress={() => onProviderChange?.("gemini")}
                activeOpacity={0.8}
              >
                <Text style={[styles.modelPickerProviderText, provider === "gemini" && styles.modelPickerProviderTextActive]}>Gemini</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modelPickerTitle}>Model</Text>
            <ScrollView style={styles.modelPickerList} keyboardShouldPersistTaps="handled">
              {modelOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modelPickerOption, model === opt.value && styles.modelPickerOptionActive]}
                  onPress={() => {
                    onModelChange?.(opt.value);
                    setModelPickerVisible(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modelPickerOptionText, model === opt.value && styles.modelPickerOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createInputPanelStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
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
  modelPickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modelPickerCard: {
    width: "100%",
    maxWidth: 320,
    maxHeight: "80%",
    backgroundColor: theme.surfaceBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  modelPickerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.textMuted,
    marginBottom: 8,
  },
  modelPickerProviderRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  modelPickerProviderBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  modelPickerProviderBtnActive: {
    backgroundColor: theme.accentLight ?? "#e8f0fe",
    borderColor: theme.accent ?? "#1a73e8",
  },
  modelPickerProviderText: {
    fontSize: 15,
    color: theme.textMuted,
  },
  modelPickerProviderTextActive: {
    color: theme.accent ?? "#1a73e8",
    fontWeight: "600",
  },
  modelPickerList: {
    maxHeight: 220,
  },
  modelPickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  modelPickerOptionActive: {
    backgroundColor: theme.accentLight ?? "#e8f0fe",
    borderColor: theme.accent ?? "#1a73e8",
  },
  modelPickerOptionText: {
    fontSize: 15,
    color: theme.textPrimary,
  },
  modelPickerOptionTextActive: {
    color: theme.accent ?? "#1a73e8",
    fontWeight: "600",
  },
  btnWebPreview: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: theme.borderColor,
    alignItems: "center",
    justifyContent: "center",
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
}
