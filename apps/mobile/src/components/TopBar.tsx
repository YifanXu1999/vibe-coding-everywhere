import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { theme } from "../theme";

export function TopBar() {
  const onShare = () => {
    // Placeholder - same as web
  };

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.icon} />
        <View style={styles.textWrap}>
          <Text style={styles.title}>Greeting</Text>
          <Text style={styles.subtitle}>Today</Text>
        </View>
        <View style={styles.chevron} />
      </View>
      <TouchableOpacity style={styles.btnShare} onPress={onShare} activeOpacity={0.8}>
        <Text style={styles.btnShareText}>Share</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: theme.borderColor,
    borderRadius: 30,
    backgroundColor: theme.cardBg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  textWrap: {
    flexDirection: "column",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textMuted,
  },
  chevron: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.borderColor,
  },
  btnShare: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: "#000",
  },
  btnShareText: {
    color: "#fff",
    fontWeight: "500",
    fontSize: 15,
  },
});
