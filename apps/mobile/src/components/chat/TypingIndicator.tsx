import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { theme } from "../../theme/index";

interface TypingIndicatorProps {
  visible: boolean;
}

export function TypingIndicator({ visible }: TypingIndicatorProps) {
  const dot1 = useRef(new Animated.Value(0.5)).current;
  const dot2 = useRef(new Animated.Value(0.5)).current;
  const dot3 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!visible) return;
    const bounce = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, useNativeDriver: true, duration: 200 }),
          Animated.timing(anim, { toValue: 0.5, useNativeDriver: true, duration: 400 }),
        ])
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [visible, dot1, dot2, dot3]);

  if (!visible) return null;

  const Dot = ({ anim }: { anim: Animated.Value }) => (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({ inputRange: [0.5, 1], outputRange: [0.6, 1] }),
            },
          ],
        },
      ]}
    />
  );

  return (
    <View style={styles.container}>
      <Dot anim={dot1} />
      <Dot anim={dot2} />
      <Dot anim={dot3} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 6,
    paddingLeft: 48,
    paddingVertical: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.textMuted,
  },
});
