import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity } from "react-native";
import { theme } from "../theme";

export type RunOutputLine = { type: "stdout" | "stderr"; text: string };

interface RunOutputViewProps {
  lines: RunOutputLine[];
  title?: string;
  maxHeight?: number;
  /** When provided, show "Terminate" button; called to kill the run process and clear output. */
  onTerminate?: () => void;
  /** When true, show container with placeholder when lines are empty (e.g. in integrated Run & Preview page). */
  showWhenEmpty?: boolean;
}

/** Strip ANSI escape sequences for display. */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-_]|\x1B.|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function RunOutputView({ lines, title = "Terminal output", maxHeight = 200, onTerminate, showWhenEmpty }: RunOutputViewProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (lines.length > 0) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [lines.length]);

  const isEmpty = lines.length === 0;
  if (isEmpty && !showWhenEmpty) return null;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {onTerminate && (lines.length > 0 || showWhenEmpty) && (
          <TouchableOpacity onPress={onTerminate} hitSlop={8}>
            <Text style={styles.terminateText}>Terminate</Text>
          </TouchableOpacity>
        )}
      </View>
      {isEmpty ? (
        <View style={[styles.scroll, styles.emptyPlaceholder, { maxHeight }]}>
          <Text style={styles.emptyPlaceholderText}>Run command to see output</Text>
        </View>
      ) : (
      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, { maxHeight }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {lines.map((line, i) => (
          <Text
            key={i}
            style={[styles.line, line.type === "stderr" ? styles.stderr : styles.stdout]}
            selectable
          >
            {stripAnsi(line.text)}
          </Text>
        ))}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.borderColor,
    backgroundColor: "#1e1e1e",
    borderRadius: 10,
    overflow: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor,
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textMuted,
  },
  terminateText: {
    fontSize: 12,
    color: theme.accent,
  },
  scroll: {
    maxHeight: 200,
  },
  content: {
    padding: 10,
    paddingBottom: 16,
  },
  line: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  stdout: {
    color: "#d4d4d4",
  },
  stderr: {
    color: "#f48771",
  },
  emptyPlaceholder: {
    justifyContent: "center",
    padding: 16,
  },
  emptyPlaceholderText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: "center",
  },
});
