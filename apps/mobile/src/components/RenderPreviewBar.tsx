import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { theme } from "../theme";
import type { PendingRender } from "../hooks/useSocket";

interface RenderPreviewBarProps {
  pendingRender: PendingRender | null;
  onRunRender: (command: string, url: string) => void;
}

export function RenderPreviewBar({ pendingRender, onRunRender }: RenderPreviewBarProps) {
  if (!pendingRender) return null;

  const { command, url } = pendingRender;

  const handlePress = () => {
    onRunRender(command, url);
    setTimeout(() => {
      Linking.openURL(url).catch(() => {});
    }, 800);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.row}>
          <Text style={styles.label}>Command: </Text>
          <Text style={styles.command}>{command}</Text>
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>URL: </Text>
          <Text style={styles.url} onPress={() => Linking.openURL(url)}>
            {url}
          </Text>
        </Text>
      </View>
      <TouchableOpacity style={styles.btn} onPress={handlePress} activeOpacity={0.8}>
        <Text style={styles.btnText}>Run command & open preview</Text>
      </TouchableOpacity>
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
    gap: 10,
  },
  row: {
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontWeight: "600",
    color: theme.textPrimary,
  },
  command: {
    fontSize: 13,
    backgroundColor: "rgba(255,255,255,0.8)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  url: {
    color: theme.accent,
    textDecorationLine: "underline",
  },
  btn: {
    alignSelf: "flex-start",
    marginTop: 8,
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
});
