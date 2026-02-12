import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  TextInput,
  Keyboard,
  Alert,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSocket } from "./src/hooks/useSocket";
import { MessageBubble } from "./src/components/MessageBubble";
import { TypingIndicator } from "./src/components/TypingIndicator";
import { RenderPreviewBar } from "./src/components/RenderPreviewBar";
import { PermissionDenialBanner } from "./src/components/PermissionDenialBanner";
import { AskQuestionModal } from "./src/components/AskQuestionModal";
import { InputPanel } from "./src/components/InputPanel";
import { PreviewWebViewModal } from "./src/components/PreviewWebViewModal";
import { RunOutputView } from "./src/components/RunOutputView";
import { WorkspaceSidebar } from "./src/components/WorkspaceSidebar";
import { FileViewerModal, type CodeRefPayload } from "./src/components/FileViewerModal";
import { DevUITestScreen } from "./src/components/DevUITestScreen";
import {
  getDefaultServerConfig,
  createWorkspaceFileService,
  getTerminalInputState,
} from "./src/core";
import { theme } from "./src/theme";

export default function App() {
  // DI: default implementations; can be replaced via context or props for tests.
  const serverConfig = useMemo(() => getDefaultServerConfig(), []);
  const workspaceFileService = useMemo(
    () => createWorkspaceFileService(serverConfig),
    [serverConfig]
  );

  const defaultPermissionMode =
    (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_DEFAULT_PERMISSION_MODE) || "bypassPermissions";
  const [permissionMode, setPermissionMode] = useState<string | null>(defaultPermissionMode);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileIsImage, setFileIsImage] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingCodeRefs, setPendingCodeRefs] = useState<CodeRefPayload[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const terminalCarouselRef = useRef<FlatList>(null);
  const lastScrollToEndTimeRef = useRef(0);
  const SCROLL_TO_END_THROTTLE_MS = 400;
  const TERMINAL_CARD_GAP = 12;
  const TERMINAL_CARD_WIDTH =
    (Dimensions.get("window").width - 32 - TERMINAL_CARD_GAP * 2) / 3;
  const TERMINAL_CARD_STEP = TERMINAL_CARD_WIDTH + TERMINAL_CARD_GAP;

  const {
    connected,
    messages,
    claudeRunning,
    waitingForUserInput,
    typingIndicator,
    pendingRender,
    permissionDenials,
    runRenderResult,
    terminals,
    selectedTerminalId,
    setSelectedTerminalId,
    runOutputLines,
    runCommand,
    runProcessActive,
    submitPrompt,
    pendingAskQuestion,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    runRenderCommand,
    runNewTerminal,
    runUserCommand,
    terminateRunProcess,
    terminateAgent,
    canRunInSelectedTerminal,
    mockSequences,
    selectedSequence,
    setSelectedSequence,
    lastSessionTerminated,
  } = useSocket();

  const [terminalFullScreen, setTerminalFullScreen] = useState(false);
  const [terminalCommandInput, setTerminalCommandInput] = useState("");
  const [showDevUITest, setShowDevUITest] = useState(false);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const selectedTerminalIndex =
    selectedTerminalId != null
      ? terminals.findIndex((t) => t.id === selectedTerminalId)
      : terminals.length > 0 ? terminals.length - 1 : 0;
  useEffect(() => {
    if (terminals.length === 0 || selectedTerminalIndex < 0) return;
    const index = Math.min(selectedTerminalIndex, terminals.length - 1);
    requestAnimationFrame(() => {
      try {
        terminalCarouselRef.current?.scrollToIndex({ index, animated: true });
      } catch (_) {
        // List may not be laid out yet
      }
    });
  }, [selectedTerminalId, terminals.length, selectedTerminalIndex]);

  useEffect(() => {
    if (!selectedFilePath) return;
    setFileLoading(true);
    setFileError(null);
    setFileContent(null);
    setFileIsImage(false);
    workspaceFileService
      .fetchFile(selectedFilePath)
      .then(({ content, isImage }) => {
        setFileContent(content);
        setFileIsImage(isImage);
        setFileLoading(false);
      })
      .catch((err) => {
        setFileError(err?.message ?? "Failed to load file");
        setFileLoading(false);
      });
  }, [selectedFilePath]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFilePath(path);
  }, []);

  const handleCloseFileViewer = useCallback(() => {
    setSelectedFilePath(null);
    setFileContent(null);
    setFileIsImage(false);
    setFileError(null);
  }, []);

  const handleAddCodeReference = useCallback((ref: CodeRefPayload) => {
    setPendingCodeRefs((prev) => [...prev, ref]);
  }, []);

  const handleRemoveCodeRef = useCallback((index: number) => {
    setPendingCodeRefs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(
    (prompt: string, pm?: string) => {
      submitPrompt(
        prompt,
        pm ?? permissionMode ?? undefined,
        undefined,
        pendingCodeRefs.length ? pendingCodeRefs : undefined
      );
      if (pendingCodeRefs.length) setPendingCodeRefs([]);
      // Return to chat page when sending
      setSidebarVisible(false);
      handleCloseFileViewer();
    },
    [submitPrompt, permissionMode, pendingCodeRefs, handleCloseFileViewer]
  );

  const handleOpenPreviewInApp = useCallback((u: string) => {
    if (u) setPreviewUrl(serverConfig.resolvePreviewUrl(u));
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewUrl(null);
  }, []);

  const handleRequestTerminate = useCallback(
    (terminalId: string) => {
      const term = terminals.find((t) => t.id === terminalId);
      const message =
        term?.pid != null
          ? `Are you sure you want to terminate this process (PID ${term.pid})? This action cannot be undone.`
          : "Are you sure you want to terminate this process? This action cannot be undone.";
      Alert.alert("Close terminal?", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Kill", style: "destructive", onPress: () => terminateRunProcess(terminalId) },
      ]);
    },
    [terminals, terminateRunProcess]
  );

  /** Close full-screen terminal window only; do not show terminate-process modal. */
  const handleCloseFullScreenTerminal = useCallback(() => {
    Keyboard.dismiss();
    setTerminalFullScreen(false);
  }, []);

  if (__DEV__ && showDevUITest) {
    return (
      <>
        <StatusBar style="dark" />
        <DevUITestScreen onBack={() => setShowDevUITest(false)} />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.page}>
          <View style={styles.contentArea}>
            {!sidebarVisible && (
              <View style={styles.menuButtonOverlay} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => setSidebarVisible(true)}
                  onLongPress={() => __DEV__ && setShowDevUITest(true)}
                  activeOpacity={0.7}
                  accessibilityLabel="Open Explorer"
                >
                  <Text style={styles.menuButtonText}>☰</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.chatShell}>
              <FlatList
              ref={flatListRef}
              style={styles.chatArea}
              contentContainerStyle={styles.chatMessages}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => {
                const isLast = index === messages.length - 1;
                const showTerminated =
                  lastSessionTerminated && isLast && item.role === "assistant" && !item.content;
                const messageToShow = showTerminated
                  ? { ...item, content: "Terminated" }
                  : item;
                return (
                  <MessageBubble
                    message={messageToShow}
                    isTerminatedLabel={showTerminated}
                  />
                );
              }}
              ListFooterComponent={
                <>
                  <TypingIndicator visible={typingIndicator} />
                  {runRenderResult && (
                    <View style={styles.runResult}>
                      <Text
                        style={[
                          styles.runResultText,
                          runRenderResult.ok ? styles.runResultOk : styles.runResultError,
                        ]}
                      >
                        {runRenderResult.message}
                      </Text>
                    </View>
                  )}
                  <RenderPreviewBar
                    pendingRender={pendingRender}
                    onRunRender={runRenderCommand}
                    onOpenPreviewInApp={handleOpenPreviewInApp}
                  />
                  {permissionDenials && permissionDenials.length > 0 && (
                    <PermissionDenialBanner
                      denials={permissionDenials}
                      onDismiss={dismissPermission}
                      onAccept={() => retryAfterPermission(permissionMode ?? undefined)}
                    />
                  )}
                </>
              }
              onContentSizeChange={() => {
                const now = Date.now();
                if (now - lastScrollToEndTimeRef.current < SCROLL_TO_END_THROTTLE_MS) return;
                lastScrollToEndTimeRef.current = now;
                flatListRef.current?.scrollToEnd({ animated: true });
              }}
            />
            </View>

            <View style={styles.sidebarOverlay} pointerEvents={sidebarVisible ? "auto" : "none"}>
              <WorkspaceSidebar
                visible={sidebarVisible}
                embedded
                onClose={() => setSidebarVisible(false)}
                onFileSelect={handleFileSelect}
              />
            </View>

            {selectedFilePath != null && (
              <View style={styles.fileViewerOverlay} pointerEvents="box-none">
                <FileViewerModal
                  visible
                  embedded
                  path={selectedFilePath}
                  content={fileContent}
                  isImage={fileIsImage}
                  loading={fileLoading}
                  error={fileError}
                  onClose={handleCloseFileViewer}
                  onAddCodeReference={handleAddCodeReference}
                />
              </View>
            )}
          </View>

          <View style={styles.inputBar}>
            <InputPanel
              connected={connected}
              claudeRunning={claudeRunning}
              waitingForUserInput={waitingForUserInput}
              permissionMode={permissionMode}
              onPermissionModeChange={setPermissionMode}
              onSubmit={handleSubmit}
              pendingCodeRefs={pendingCodeRefs}
              onRemoveCodeRef={handleRemoveCodeRef}
              showTerminalButton={terminals.length > 0}
              runProcessActive={runProcessActive}
              onShowTerminal={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onOpenTerminal={() => setTerminalFullScreen(true)}
              onTerminateAgent={terminateAgent}
            />
          </View>
        </View>

        <AskQuestionModal
          pending={pendingAskQuestion}
          onSubmit={submitAskQuestionAnswer}
          onCancel={dismissAskQuestion}
        />

        <PreviewWebViewModal
          visible={previewUrl != null}
          url={previewUrl ?? ""}
          title="Preview"
          onClose={handleClosePreview}
        />

        <Modal
          visible={terminalFullScreen}
          animationType="slide"
          onRequestClose={handleCloseFullScreenTerminal}
        >
          <SafeAreaView style={styles.fullScreenTerminalSafe}>
            <View style={styles.fullScreenTerminalHeader}>
              <Text style={styles.fullScreenTerminalTitle}>Terminal management</Text>
              <View style={styles.fullScreenTerminalHeaderActions}>
                <TouchableOpacity
                  onPress={runNewTerminal}
                  hitSlop={8}
                  style={styles.fullScreenNewTerminalButton}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fullScreenNewTerminalText}>New</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCloseFullScreenTerminal}
                  hitSlop={12}
                  style={styles.fullScreenCloseButton}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fullScreenCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.fullScreenTerminalContent}>
              {terminals.length > 0 ? (
                <>
                  <View style={styles.fullScreenTerminalListHeader}>
                    <Text style={styles.fullScreenTerminalListTitle}>Processes</Text>
                  </View>
                  <FlatList
                    ref={terminalCarouselRef}
                    data={terminals}
                    keyExtractor={(t) => t.id}
                    horizontal
                    pagingEnabled={false}
                    snapToInterval={TERMINAL_CARD_STEP}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.fullScreenTerminalCarouselContent}
                    style={styles.fullScreenTerminalCarousel}
                    getItemLayout={(_: unknown, index: number) => ({
                      length: TERMINAL_CARD_STEP,
                      offset: TERMINAL_CARD_STEP * index,
                      index,
                    })}
                    onMomentumScrollEnd={(e) => {
                      const index = Math.round(
                        e.nativeEvent.contentOffset.x / TERMINAL_CARD_STEP
                      );
                      if (index >= 0 && index < terminals.length) {
                        setSelectedTerminalId(terminals[index].id);
                      }
                    }}
                    renderItem={({ item: term }) => {
                      const isSelected = term.id === selectedTerminalId;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.fullScreenTerminalCard,
                            { width: TERMINAL_CARD_WIDTH },
                            isSelected && styles.fullScreenTerminalCardSelected,
                          ]}
                          onPress={() => setSelectedTerminalId(term.id)}
                          activeOpacity={1}
                        >
                          <View style={styles.fullScreenTerminalCardInner}>
                            <View style={styles.fullScreenTerminalCardTopRow}>
                              <View
                                style={[
                                  styles.fullScreenTerminalStatusBadge,
                                  term.active ? styles.fullScreenTerminalStatusRunning : styles.fullScreenTerminalStatusIdle,
                                ]}
                              >
                                <Text style={styles.fullScreenTerminalStatusText}>
                                  {term.active ? "Running" : "Idle"}
                                </Text>
                              </View>
                              <View style={styles.fullScreenTerminalCloseRowButtonWrap} pointerEvents="box-none">
                                <TouchableOpacity
                                  onPress={() => handleRequestTerminate(term.id)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={styles.fullScreenTerminalCloseRowButton}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.fullScreenTerminalCloseRowIcon}>×</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            {term.pid != null && (
                              <Text style={styles.fullScreenTerminalPid}>PID {term.pid}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <View style={styles.fullScreenTerminalOutputWrap}>
                    <RunOutputView
                      lines={runOutputLines}
                      command={runCommand}
                      title="Output"
                      showWhenEmpty
                      flexOutput
                      onTerminate={
                        (selectedTerminalId ?? terminals[terminals.length - 1]?.id)
                          ? () =>
                              handleRequestTerminate(
                                selectedTerminalId ?? terminals[terminals.length - 1]!.id
                              )
                          : undefined
                      }
                    />
                    {(() => {
                      const inputState = getTerminalInputState(
                        selectedTerminalId,
                        terminals,
                        canRunInSelectedTerminal
                      );
                      if (inputState === "disabled") {
                        return (
                          <View style={styles.terminalCommandDisabledHint}>
                            <Text style={styles.terminalCommandDisabledText}>
                              Command running. Terminate to run another.
                            </Text>
                          </View>
                        );
                      }
                      if (inputState !== "enabled") return null;
                      return (
                        <View style={styles.terminalCommandRow}>
                          <TextInput
                            style={styles.terminalCommandInput}
                            placeholder="Type a command…"
                            placeholderTextColor={theme.textMuted}
                            value={terminalCommandInput}
                            onChangeText={setTerminalCommandInput}
                            onSubmitEditing={() => {
                              if (terminalCommandInput.trim()) {
                                runUserCommand(terminalCommandInput.trim());
                                setTerminalCommandInput("");
                              }
                            }}
                            returnKeyType="send"
                          />
                          <TouchableOpacity
                            style={styles.terminalCommandRunButton}
                            onPress={() => {
                              if (terminalCommandInput.trim()) {
                                runUserCommand(terminalCommandInput.trim());
                                setTerminalCommandInput("");
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.terminalCommandRunText}>Run</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })()}
                  </View>
                </>
              ) : (
                <View style={styles.fullScreenTerminalEmpty}>
                  <Text style={styles.fullScreenTerminalEmptyText}>
                    No terminals. Run a command from the chat or tap "New" to open a shell.
                  </Text>
                </View>
              )}
            </View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.beigeBg,
  },
  keyboardView: {
    flex: 1,
  },
  page: {
    flex: 1,
    flexDirection: "column",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  contentArea: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
  },
  sidebarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  fileViewerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
  },
  menuButtonOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.borderColor,
    justifyContent: "center",
    alignItems: "center",
  },
  menuButtonText: {
    fontSize: 22,
    color: theme.textPrimary,
  },
  chatShell: {
    flex: 1,
    marginTop: 22,
    minHeight: 0,
  },
  chatArea: {
    flex: 1,
  },
  inputBar: {
    flexShrink: 0,
    flexGrow: 0,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sequencePicker: {
    maxHeight: 40,
    marginBottom: 8,
  },
  sequencePickerContent: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  sequenceChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  sequenceChipSelected: {
    backgroundColor: theme.accentLight,
    borderColor: theme.accent,
  },
  sequenceChipText: {
    fontSize: 13,
    color: theme.textMuted,
  },
  sequenceChipTextSelected: {
    color: theme.accent,
    fontWeight: "600",
  },
  chatMessages: {
    paddingVertical: 12,
    gap: 16,
    paddingBottom: 24,
  },
  runResult: {
    paddingVertical: 8,
    paddingLeft: 48,
  },
  runResultText: {
    fontSize: 14,
  },
  runResultOk: {
    color: theme.success,
  },
  runResultError: {
    color: theme.danger,
  },
  fullScreenTerminalSafe: {
    flex: 1,
    backgroundColor: theme.beigeBg,
  },
  fullScreenTerminalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor,
    backgroundColor: theme.surfaceBg,
  },
  fullScreenTerminalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  fullScreenTerminalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fullScreenNewTerminalButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  fullScreenNewTerminalText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.accent,
  },
  fullScreenCloseButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: theme.accent,
    borderRadius: 8,
  },
  fullScreenCloseText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  fullScreenTerminalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 0,
  },
  fullScreenTerminalListHeader: {
    paddingVertical: 8,
  },
  fullScreenTerminalListTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.textMuted,
  },
  fullScreenTerminalCarousel: {
    maxHeight: 72,
    marginBottom: 12,
  },
  fullScreenTerminalCarouselContent: {
    paddingRight: 16,
  },
  fullScreenTerminalCard: {
    marginRight: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderColor,
    backgroundColor: theme.surfaceBg,
    overflow: "hidden",
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 10,
  },
  fullScreenTerminalCardSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.beigeBg,
    borderWidth: 1.5,
  },
  fullScreenTerminalCardInner: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: 44,
  },
  fullScreenTerminalCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fullScreenTerminalStatusBadge: {
    alignSelf: "flex-start",
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fullScreenTerminalStatusRunning: {
    backgroundColor: theme.success + "28",
  },
  fullScreenTerminalStatusIdle: {
    backgroundColor: theme.textMuted + "20",
  },
  fullScreenTerminalStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textPrimary,
    letterSpacing: 0.2,
  },
  fullScreenTerminalPid: {
    fontSize: 12,
    color: theme.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.3,
    alignSelf: "center",
  },
  fullScreenTerminalRowLabel: {
    fontSize: 12,
    color: theme.textMuted,
  },
  fullScreenTerminalRowLabelSelected: {
    color: theme.textPrimary,
    fontWeight: "500",
  },
  fullScreenTerminalCloseRowButtonWrap: {
    zIndex: 10,
  },
  fullScreenTerminalCloseRowButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.danger + "22",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenTerminalCloseRowIcon: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.danger,
    lineHeight: 14,
  },
  fullScreenTerminalOutputWrap: {
    flex: 1,
    minHeight: 0,
  },
  fullScreenTerminalEmpty: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  fullScreenTerminalEmptyText: {
    fontSize: 15,
    color: theme.textMuted,
    textAlign: "center",
  },
  terminalCommandDisabledHint: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: theme.borderColor,
    backgroundColor: theme.beigeBg,
  },
  terminalCommandDisabledText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: "center",
  },
  terminalCommandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: theme.borderColor,
    backgroundColor: theme.surfaceBg,
  },
  terminalCommandInput: {
    flex: 1,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
    color: theme.textPrimary,
    backgroundColor: theme.beigeBg,
    borderWidth: 1,
    borderColor: theme.borderColor,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  terminalCommandRunButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: theme.accent,
    borderRadius: 8,
  },
  terminalCommandRunText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
