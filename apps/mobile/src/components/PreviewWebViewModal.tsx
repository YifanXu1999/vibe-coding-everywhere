import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { theme } from "../theme";

interface PreviewWebViewModalProps {
  visible: boolean;
  url: string;
  title?: string;
  onClose: () => void;
}

export function PreviewWebViewModal({
  visible,
  url,
  title = "Preview",
  onClose,
}: PreviewWebViewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!visible || !url?.trim()) return null;

  const resolvedUrl = url.trim();
  console.log("[PreviewURL] PreviewWebViewModal: loading uri=" + resolvedUrl);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.safe}>
        <View style={styles.webContainer}>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={styles.loadingText}>加载中…</Text>
            </View>
          )}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.urlHint}>{resolvedUrl}</Text>
            </View>
          ) : (
            <WebView
              source={{ uri: resolvedUrl }}
              style={styles.webview}
              onLoadStart={() => {
                setLoading(true);
                setError(null);
              }}
              onLoadEnd={() => {
                setLoading(false);
                console.log("[PreviewURL] WebView onLoadEnd: loaded successfully uri=" + resolvedUrl);
              }}
              onError={(e) => {
                setLoading(false);
                const desc = e.nativeEvent?.description ?? "加载失败";
                console.log("[PreviewURL] WebView onError: uri=" + resolvedUrl + " | description=" + desc);
                setError(desc);
              }}
              onHttpError={(e) => {
                setLoading(false);
                const status = e.nativeEvent?.statusCode;
                console.log("[PreviewURL] WebView onHttpError: uri=" + resolvedUrl + " | statusCode=" + (e.nativeEvent?.statusCode ?? ""));
                setError(status ? `HTTP ${status}` : "加载失败");
              }}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scalesPageToFit
              mixedContentMode="compatibility"
            />
          )}
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.8}
          accessibilityLabel="Close preview"
        >
          <Text style={styles.closeText}>关闭</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000",
  },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    right: 16,
    zIndex: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
  },
  closeText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
  webContainer: {
    flex: 1,
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: theme.surfaceBg,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.surfaceBg,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: theme.textMuted,
  },
  errorBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: theme.danger,
    textAlign: "center",
  },
  urlHint: {
    marginTop: 8,
    fontSize: 12,
    color: theme.textMuted,
  },
});
