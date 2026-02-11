import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSocket } from "./src/hooks/useSocket";
import { TopBar } from "./src/components/TopBar";
import { MessageBubble } from "./src/components/MessageBubble";
import { TypingIndicator } from "./src/components/TypingIndicator";
import { RenderPreviewBar } from "./src/components/RenderPreviewBar";
import { PermissionDenialBanner } from "./src/components/PermissionDenialBanner";
import { InputPanel } from "./src/components/InputPanel";
import { theme } from "./src/theme";

export default function App() {
  const [permissionMode, setPermissionMode] = useState<string | null>(null);
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
    submitPrompt,
    retryAfterPermission,
    dismissPermission,
    runRenderCommand,
  } = useSocket();

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSubmit = useCallback(
    (prompt: string, pm?: string) => {
      submitPrompt(prompt, pm ?? permissionMode ?? undefined);
    },
    [submitPrompt, permissionMode]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.page}>
          <TopBar />

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
                </>
              }
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            <RenderPreviewBar pendingRender={pendingRender} onRunRender={runRenderCommand} />

            {permissionDenials && permissionDenials.length > 0 && (
              <PermissionDenialBanner
                denials={permissionDenials}
                onDismiss={dismissPermission}
                onAccept={() => retryAfterPermission(permissionMode ?? undefined)}
              />
            )}

            <InputPanel
              connected={connected}
              claudeRunning={claudeRunning}
              waitingForUserInput={waitingForUserInput}
              permissionMode={permissionMode}
              onPermissionModeChange={setPermissionMode}
              onSubmit={handleSubmit}
            />
          </View>
        </View>
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
  chatShell: {
    flex: 1,
    marginTop: 22,
    gap: 18,
  },
  chatArea: {
    flex: 1,
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
