import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSocket } from "./src/hooks/useSocket";
import { MessageBubble } from "./src/components/MessageBubble";
import { TypingIndicator } from "./src/components/TypingIndicator";
import { RenderPreviewBar } from "./src/components/RenderPreviewBar";
import { PermissionDenialBanner } from "./src/components/PermissionDenialBanner";
import { InputPanel } from "./src/components/InputPanel";
import { PreviewWebViewModal } from "./src/components/PreviewWebViewModal";
import { RunOutputView } from "./src/components/RunOutputView";
import { WorkspaceSidebar } from "./src/components/WorkspaceSidebar";
import { FileViewerModal, type CodeRefPayload } from "./src/components/FileViewerModal";
import { resolvePreviewUrl, getServerBaseUrl } from "./src/utils/serverUrl";
import { theme } from "./src/theme";

export default function App() {
  const [permissionMode, setPermissionMode] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileIsImage, setFileIsImage] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingCodeRefs, setPendingCodeRefs] = useState<CodeRefPayload[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const {
    connected,
    messages,
    claudeRunning,
    waitingForUserInput,
    typingIndicator,
    pendingRender,
    permissionDenials,
    runRenderResult,
    runOutputLines,
    submitPrompt,
    retryAfterPermission,
    dismissPermission,
    runRenderCommand,
    terminateRunProcess,
  } = useSocket();

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!selectedFilePath) return;
    setFileLoading(true);
    setFileError(null);
    setFileContent(null);
    setFileIsImage(false);
    const baseUrl = getServerBaseUrl();
    const url = `${baseUrl}/api/workspace-file?path=${encodeURIComponent(selectedFilePath)}`;
    fetch(url)
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          let errMsg = res.statusText;
          try {
            const b = JSON.parse(text);
            if (b?.error && typeof b.error === "string") errMsg = b.error;
          } catch (_) {}
          throw new Error(errMsg);
        }
        return text;
      })
      .then((text) => {
        const data = JSON.parse(text) as { path?: string; content?: string; isImage?: boolean };
        const raw = data?.content;
        const content = typeof raw === "string" ? raw : raw != null ? String(raw) : null;
        setFileContent(content);
        setFileIsImage(data?.isImage === true);
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
    if (u) setPreviewUrl(resolvePreviewUrl(u));
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewUrl(null);
  }, []);

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
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MessageBubble message={item} />}
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
                  <RunOutputView
                    lines={runOutputLines}
                    title="Run output"
                    maxHeight={200}
                    onTerminate={terminateRunProcess}
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
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
            />
          </View>
        </View>

        <PreviewWebViewModal
          visible={previewUrl != null}
          url={previewUrl ?? ""}
          title="Preview"
          onClose={handleClosePreview}
        />
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
    position: "relative",
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
    justifyContent: "center",
    paddingLeft: 24,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surfaceBg,
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
    paddingTop: 12,
    paddingBottom: 8,
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
});
