/**
 * Dev-only screen to preview PermissionDenialBanner and AskQuestionModal on device/simulator.
 * Only reachable in __DEV__ (e.g. long-press menu button in App).
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PermissionDenialBanner } from "./PermissionDenialBanner";
import { AskQuestionModal } from "./AskQuestionModal";
import type { PermissionDenial, PendingAskUserQuestion } from "../core/types";
import { theme } from "../theme";

const MOCK_DENIAL_SINGLE: PermissionDenial[] = [
  { tool_name: "Bash", tool: "Bash" },
];

const MOCK_DENIAL_FILE: PermissionDenial[] = [
  { tool_name: "Read", tool_input: { file_path: "/workspace/secret.txt" } },
];

const MOCK_DENIALS_MULTIPLE: PermissionDenial[] = [
  { tool_name: "Bash", tool: "Bash" },
  { tool_name: "Read", tool_input: { file_path: "/workspace/secret.txt" } },
  { tool: "Edit", tool_input: { path: "apps/mobile/App.tsx" } },
];

const MOCK_ASK_SINGLE: PendingAskUserQuestion = {
  tool_use_id: "toolu_dev_single",
  questions: [
    {
      header: "Purpose",
      question: "What should the Python file do or contain?",
      options: [
        { label: "Script template", description: "A basic Python script with main function and argument parsing" },
        { label: "Class template", description: "A Python file with a sample class structure" },
        { label: "Flask/FastAPI app", description: "A basic web application template" },
        { label: "Utility functions", description: "A module with common utility functions" },
      ],
      multiSelect: false,
    },
  ],
};

const MOCK_ASK_TWO: PendingAskUserQuestion = {
  tool_use_id: "toolu_dev_two",
  questions: [
    {
      header: "Purpose",
      question: "What is the landing page for?",
      options: [
        { label: "Product/SaaS", description: "Showcase and sell a software product or service" },
        { label: "Portfolio", description: "Personal or business portfolio showcasing work" },
      ],
      multiSelect: false,
    },
    {
      header: "Style",
      question: "What style do you prefer for the design?",
      options: [
        { label: "Modern minimal", description: "Clean lines, lots of whitespace, simple colors" },
        { label: "Dark theme", description: "Dark background with contrasting elements" },
      ],
      multiSelect: false,
    },
  ],
};

export interface DevUITestScreenProps {
  onBack: () => void;
}

const MIN_TOP_INSET = Platform.OS === "ios" ? 44 : 24;

export function DevUITestScreen({ onBack }: DevUITestScreenProps) {
  const [denials, setDenials] = useState<PermissionDenial[] | null>(null);
  const [askQuestion, setAskQuestion] = useState<PendingAskUserQuestion | null>(null);
  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top, MIN_TOP_INSET) + 12;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.header, { paddingTop: headerTopPadding }]}>
        <Text style={styles.title}>UI test (dev)</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>← Back to chat</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.section}>PermissionDenialBanner</Text>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setDenials(MOCK_DENIAL_SINGLE)}
          activeOpacity={0.8}
        >
          <Text style={styles.triggerText}>Show: single (Bash)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setDenials(MOCK_DENIAL_FILE)}
          activeOpacity={0.8}
        >
          <Text style={styles.triggerText}>Show: file access (Read + path)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setDenials(MOCK_DENIALS_MULTIPLE)}
          activeOpacity={0.8}
        >
          <Text style={styles.triggerText}>Show: multiple denials</Text>
        </TouchableOpacity>

        <Text style={[styles.section, { marginTop: 24 }]}>AskQuestionModal</Text>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setAskQuestion(MOCK_ASK_SINGLE)}
          activeOpacity={0.8}
        >
          <Text style={styles.triggerText}>Show: single question</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setAskQuestion(MOCK_ASK_TWO)}
          activeOpacity={0.8}
        >
          <Text style={styles.triggerText}>Show: two questions</Text>
        </TouchableOpacity>
      </ScrollView>

      {denials != null && denials.length > 0 && (
        <View style={styles.bannerWrap}>
          <PermissionDenialBanner
            denials={denials}
            onDismiss={() => setDenials(null)}
            onAccept={() => setDenials(null)}
          />
        </View>
      )}

      <AskQuestionModal
        pending={askQuestion}
        onSubmit={(answers) => {
          console.log("[DevUITest] AskQuestion answers:", answers);
          setAskQuestion(null);
        }}
        onCancel={() => setAskQuestion(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.beigeBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderColor,
    backgroundColor: theme.surfaceBg,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  section: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textMuted,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  trigger: {
    backgroundColor: theme.surfaceBg,
    borderWidth: 1,
    borderColor: theme.borderColor,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  triggerText: {
    fontSize: 15,
    color: theme.textPrimary,
    fontWeight: "500",
  },
  bannerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
