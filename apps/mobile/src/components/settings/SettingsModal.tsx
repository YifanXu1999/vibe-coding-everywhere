import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../../theme/index";
import type { Provider } from "../../theme/index";

export type PermissionModeUI = "always_ask" | "ask_once_per_session" | "yolo";

const PERMISSION_OPTIONS: { value: PermissionModeUI; label: string }[] = [
  { value: "always_ask", label: "Always ask" },
  { value: "ask_once_per_session", label: "Ask once per permission during session" },
  { value: "yolo", label: "YOLO" },
];

type WorkspaceChild = { name: string; path: string };

export interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  provider: Provider;
  setProviderAndModel: (p: Provider) => void;
  model: string;
  setModel: (m: string) => void;
  modelOptions: { value: string; label: string }[];
  permissionMode: PermissionModeUI;
  onPermissionModeChange: (mode: PermissionModeUI) => void;
  onStopSession: () => void;
  onNewSession: () => void;
  claudeRunning: boolean;
  workspacePath: string | null;
  workspaceLoading?: boolean;
  onRefreshWorkspace?: () => void;
  /** Base URL for API (e.g. http://localhost:3456) for workspace picker */
  serverBaseUrl: string;
}

export function SettingsModal({
  visible,
  onClose,
  provider,
  setProviderAndModel,
  model,
  setModel,
  modelOptions,
  permissionMode,
  onPermissionModeChange,
  onStopSession,
  onNewSession,
  claudeRunning,
  workspacePath,
  workspaceLoading,
  onRefreshWorkspace,
  serverBaseUrl,
}: SettingsModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [allowedRoot, setAllowedRoot] = useState<string | null>(null);
  const [browseParent, setBrowseParent] = useState<string>("");
  const [pickerChildren, setPickerChildren] = useState<WorkspaceChild[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const fetchPickerChildren = useCallback(
    (parent: string) => {
      setPickerLoading(true);
      setPickerError(null);
      const q = parent ? `?parent=${encodeURIComponent(parent)}` : "";
      fetch(`${serverBaseUrl}/api/workspace-allowed-children${q}`)
        .then((res) => res.json())
        .then((data) => setPickerChildren(data?.children ?? []))
        .catch((e) => setPickerError(e?.message ?? "Failed to load"))
        .finally(() => setPickerLoading(false));
    },
    [serverBaseUrl]
  );

  useEffect(() => {
    if (showWorkspacePicker && visible) {
      fetch(`${serverBaseUrl}/api/workspace-path`)
        .then((res) => res.json())
        .then((data) => {
          setAllowedRoot(data?.allowedRoot ?? null);
          setBrowseParent("");
          fetchPickerChildren("");
        })
        .catch(() => setAllowedRoot(null));
    }
  }, [showWorkspacePicker, visible, serverBaseUrl, fetchPickerChildren]);

  useEffect(() => {
    if (showWorkspacePicker && allowedRoot != null) {
      fetchPickerChildren(browseParent);
    }
  }, [showWorkspacePicker, allowedRoot, browseParent, fetchPickerChildren]);

  const currentBrowseFullPath = allowedRoot
    ? browseParent
      ? `${allowedRoot}/${browseParent.replace(/^\//, "")}`
      : allowedRoot
    : "";

  const handleSelectWorkspace = useCallback(
    (path: string) => {
      setPickerLoading(true);
      fetch(`${serverBaseUrl}/api/workspace-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
        .then((res) => {
          if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d?.error ?? res.statusText)));
          setShowWorkspacePicker(false);
          onRefreshWorkspace?.();
        })
        .catch((e) => setPickerError(e?.message ?? "Failed to set workspace"))
        .finally(() => setPickerLoading(false));
    },
    [serverBaseUrl, onRefreshWorkspace]
  );

  const handleOpenFolder = useCallback(
    (child: WorkspaceChild) => {
      if (!allowedRoot) return;
      const rel = child.path.startsWith(allowedRoot)
        ? child.path.slice(allowedRoot.length).replace(/^\//, "")
        : child.path;
      setBrowseParent(rel);
    },
    [allowedRoot]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.fullScreen}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
              <Text style={styles.title}>Settings</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 1. Code Agent Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Code Agent Selection</Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.agentOption, provider === "claude" && styles.agentOptionActive]}
                    onPress={() => setProviderAndModel("claude")}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.agentOptionText, provider === "claude" && styles.agentOptionTextActive]}>
                      Claude
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.agentOption, provider === "gemini" && styles.agentOptionActive]}
                    onPress={() => setProviderAndModel("gemini")}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.agentOptionText, provider === "gemini" && styles.agentOptionTextActive]}>
                      Gemini
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.modelRow}>
                  {modelOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.modelChip, model === opt.value && styles.modelChipActive]}
                      onPress={() => setModel(opt.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.modelChipText, model === opt.value && styles.modelChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 2. Session Management */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Session Management</Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.actionBtn, claudeRunning && styles.actionBtnDanger]}
                    onPress={onStopSession}
                    disabled={!claudeRunning}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnText}>Stop current session</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={onNewSession}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnText}>New session</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3. Workspace Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Workspace Selection</Text>
                <View style={styles.workspaceBox}>
                  <Text style={styles.workspacePath} numberOfLines={2}>
                    {workspaceLoading ? "Loading…" : workspacePath ?? "—"}
                  </Text>
                  <View style={styles.workspaceActions}>
                    <TouchableOpacity
                      style={styles.changeWorkspaceBtn}
                      onPress={() => setShowWorkspacePicker(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.refreshWorkspaceText}>Change…</Text>
                    </TouchableOpacity>
                    {onRefreshWorkspace && (
                      <TouchableOpacity style={styles.refreshWorkspaceBtn} onPress={onRefreshWorkspace} activeOpacity={0.8}>
                        <Text style={styles.refreshWorkspaceText}>Refresh</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {showWorkspacePicker && (
                <View style={styles.pickerOverlay}>
                  <View style={styles.pickerCard}>
                    <View style={styles.pickerHeader}>
                      <Text style={styles.pickerTitle}>Select workspace</Text>
                      <TouchableOpacity onPress={() => setShowWorkspacePicker(false)} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    {allowedRoot && (
                      <>
                        <View style={styles.breadcrumb}>
                          {browseParent ? (
                            <TouchableOpacity
                              onPress={() => {
                                const parts = browseParent.split("/").filter(Boolean);
                                setBrowseParent(parts.slice(0, -1).join("/"));
                              }}
                              style={styles.breadcrumbItem}
                            >
                              <Text style={styles.breadcrumbText}>← Back</Text>
                            </TouchableOpacity>
                          ) : null}
                          <Text style={styles.breadcrumbPath} numberOfLines={1}>
                            {allowedRoot}/{browseParent}
                          </Text>
                        </View>
                        {browseParent ? (
                          <TouchableOpacity
                            style={styles.useThisFolderBtn}
                            onPress={() => handleSelectWorkspace(currentBrowseFullPath)}
                            disabled={pickerLoading}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.useThisFolderText}>Use this folder</Text>
                          </TouchableOpacity>
                        ) : null}
                        {pickerError ? (
                          <Text style={styles.pickerError}>{pickerError}</Text>
                        ) : pickerLoading && pickerChildren.length === 0 ? (
                          <ActivityIndicator size="small" color={theme.accent} style={styles.pickerLoader} />
                        ) : (
                          <ScrollView style={styles.pickerList} nestedScrollEnabled>
                            {pickerChildren.map((child) => (
                              <View key={child.path} style={styles.pickerRow}>
                                <Text style={styles.pickerRowName} numberOfLines={1}>
                                  {child.name}
                                </Text>
                                <View style={styles.pickerRowActions}>
                                  <TouchableOpacity
                                    style={styles.pickerRowBtn}
                                    onPress={() => handleOpenFolder(child)}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.pickerRowBtnText}>Open</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.pickerRowBtn, styles.pickerRowBtnPrimary]}
                                    onPress={() => handleSelectWorkspace(child.path)}
                                    disabled={pickerLoading}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.pickerRowBtnTextPrimary}>Select</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        )}
                      </>
                    )}
                  </View>
                </View>
              )}

              {/* 4. Permission Mode Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Permission Mode</Text>
                {PERMISSION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.permissionOption, permissionMode === opt.value && styles.permissionOptionActive]}
                    onPress={() => onPermissionModeChange(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.permissionOptionText, permissionMode === opt.value && styles.permissionOptionTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 5. Theme */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Theme</Text>
                <Text style={styles.themeNote}>Follow Agent (theme follows Code Agent selection)</Text>
              </View>
            </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    fullScreen: {
      flex: 1,
      backgroundColor: theme.beigeBg,
    },
    safe: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.borderColor,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    closeBtn: {
      padding: 8,
    },
    closeBtnText: {
      fontSize: 20,
      color: theme.textMuted,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.textMuted,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    agentOption: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    agentOptionActive: {
      backgroundColor: theme.accentLight,
      borderColor: theme.accent,
    },
    agentOptionText: {
      fontSize: 15,
      color: theme.textMuted,
    },
    agentOptionTextActive: {
      color: theme.accent,
      fontWeight: "600",
    },
    modelRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    modelChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    modelChipActive: {
      backgroundColor: theme.accentLight,
      borderColor: theme.accent,
    },
    modelChipText: {
      fontSize: 13,
      color: theme.textMuted,
    },
    modelChipTextActive: {
      color: theme.accent,
      fontWeight: "600",
    },
    actionBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    actionBtnDanger: {
      borderColor: theme.danger,
      backgroundColor: theme.beigeBg,
    },
    actionBtnText: {
      fontSize: 14,
      color: theme.textPrimary,
    },
    workspaceBox: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    workspacePath: {
      fontSize: 13,
      color: theme.textPrimary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    workspaceActions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 8,
    },
    changeWorkspaceBtn: {
      alignSelf: "flex-start",
    },
    refreshWorkspaceBtn: {
      alignSelf: "flex-start",
    },
    refreshWorkspaceText: {
      fontSize: 13,
      color: theme.accent,
      fontWeight: "500",
    },
    pickerOverlay: {
      marginTop: 8,
      padding: 12,
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    pickerCard: {
      maxHeight: 280,
    },
    pickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    pickerTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    breadcrumb: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      gap: 6,
    },
    breadcrumbItem: {
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    breadcrumbText: {
      fontSize: 13,
      color: theme.accent,
    },
    breadcrumbPath: {
      flex: 1,
      fontSize: 12,
      color: theme.textMuted,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    useThisFolderBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: theme.accentLight,
      borderWidth: 1,
      borderColor: theme.accent,
      marginBottom: 8,
      alignSelf: "flex-start",
    },
    useThisFolderText: {
      fontSize: 14,
      color: theme.accent,
      fontWeight: "600",
    },
    pickerError: {
      fontSize: 13,
      color: theme.danger,
      marginBottom: 8,
    },
    pickerLoader: {
      marginVertical: 12,
    },
    pickerList: {
      maxHeight: 180,
    },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.borderColor,
    },
    pickerRowName: {
      flex: 1,
      fontSize: 14,
      color: theme.textPrimary,
    },
    pickerRowActions: {
      flexDirection: "row",
      gap: 8,
    },
    pickerRowBtn: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    pickerRowBtnPrimary: {
      backgroundColor: theme.accentLight,
      borderColor: theme.accent,
    },
    pickerRowBtnText: {
      fontSize: 12,
      color: theme.textMuted,
    },
    pickerRowBtnTextPrimary: {
      fontSize: 12,
      color: theme.accent,
      fontWeight: "600",
    },
    permissionOption: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
      marginBottom: 8,
    },
    permissionOptionActive: {
      backgroundColor: theme.accentLight,
      borderColor: theme.accent,
    },
    permissionOptionText: {
      fontSize: 14,
      color: theme.textPrimary,
    },
    permissionOptionTextActive: {
      color: theme.accent,
      fontWeight: "600",
    },
    themeNote: {
      fontSize: 14,
      color: theme.textMuted,
    },
  });
}
