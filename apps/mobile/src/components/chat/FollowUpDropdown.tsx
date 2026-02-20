import React, { useMemo } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from "react-native";
import { useTheme } from "../../theme/index";

export type FollowUpOption = {
  name: string;
  description?: string;
};

interface FollowUpDropdownProps {
  visible: boolean;
  onClose: () => void;
  options: FollowUpOption[];
  onSelect: (index: number) => void;
}

export function FollowUpDropdown({ visible, onClose, options, onSelect }: FollowUpDropdownProps) {
  const theme = useTheme();
  const styles = useMemo(() => createFollowUpDropdownStyles(theme), [theme]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Follow up</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {options.length === 0 ? (
              <Text style={styles.emptyText}>No follow-up options available</Text>
            ) : (
              options.map((opt, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.option}
                  onPress={() => {
                    onSelect(index);
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionName}>{opt.name}</Text>
                  {opt.description ? (
                    <Text style={styles.optionDescription} numberOfLines={2}>
                      {opt.description}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function createFollowUpDropdownStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 340,
      maxHeight: "80%",
      backgroundColor: theme.surfaceBg,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: theme.borderColor,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 16,
    },
    list: {
      maxHeight: 320,
    },
    emptyText: {
      fontSize: 14,
      color: theme.textMuted,
      paddingVertical: 16,
      paddingHorizontal: 14,
    },
    option: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.borderColor,
      minHeight: 52,
      justifyContent: "center",
    },
    optionName: {
      fontSize: 16,
      color: theme.textPrimary,
      fontWeight: "600",
    },
    optionDescription: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
  });
}
