import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const STEPS = [
  { label: "Input Parse", icon: "input" as const },
  { label: "Duplicate Remove", icon: "filter-list" as const },
  { label: "Validation Check", icon: "verified" as const },
  { label: "Live Status Check", icon: "wifi" as const },
];

interface Props {
  visible: boolean;
  step: string;
  progress: number;
  stepIndex: number;
}

export function ProcessingOverlay({ visible, step, progress, stepIndex }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const spinAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const dotAnim1 = useRef(new Animated.Value(0.3)).current;
  const dotAnim2 = useRef(new Animated.Value(0.3)).current;
  const dotAnim3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spin.start();

      const dotLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim1, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dotAnim2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dotAnim3, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(200),
          Animated.parallel([
            Animated.timing(dotAnim1, { toValue: 0.3, duration: 200, useNativeDriver: true }),
            Animated.timing(dotAnim2, { toValue: 0.3, duration: 200, useNativeDriver: true }),
            Animated.timing(dotAnim3, { toValue: 0.3, duration: 200, useNativeDriver: true }),
          ]),
        ])
      );
      dotLoop.start();

      return () => {
        spin.stop();
        dotLoop.stop();
      };
    } else {
      Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [progress]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!visible) return null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <Animated.View
      style={[styles.backdrop, { opacity: opacityAnim, paddingTop: topPad }]}
    >
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.spinnerRow}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <MaterialIcons name="sync" size={36} color={colors.primary} />
          </Animated.View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Processing UIDs
          </Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((s, idx) => {
            const done = idx < stepIndex;
            const active = idx === stepIndex;
            const pending = idx > stepIndex;
            return (
              <View key={s.label} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepIcon,
                    done && { backgroundColor: colors.success },
                    active && { backgroundColor: colors.primary },
                    pending && { backgroundColor: colors.border },
                  ]}
                >
                  {done ? (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  ) : active ? (
                    <MaterialIcons name={s.icon} size={14} color="#fff" />
                  ) : (
                    <MaterialIcons name={s.icon} size={14} color={colors.mutedForeground} />
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    { color: done || active ? colors.foreground : colors.mutedForeground },
                    active && styles.stepLabelActive,
                  ]}
                >
                  {s.label}
                </Text>
                {done && (
                  <MaterialIcons name="check-circle" size={16} color={colors.success} style={styles.checkRight} />
                )}
              </View>
            );
          })}
        </View>

        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>

        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {step}
          </Text>
          <View style={styles.dots}>
            <Animated.Text style={[styles.dot, { color: colors.primary, opacity: dotAnim1 }]}>
              •
            </Animated.Text>
            <Animated.Text style={[styles.dot, { color: colors.primary, opacity: dotAnim2 }]}>
              •
            </Animated.Text>
            <Animated.Text style={[styles.dot, { color: colors.primary, opacity: dotAnim3 }]}>
              •
            </Animated.Text>
          </View>
        </View>

        <Text style={[styles.progressPct, { color: colors.primary }]}>
          {Math.round(progress)}%
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 15, 0.96)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  card: {
    width: "88%",
    borderRadius: 20,
    padding: 28,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  spinnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  stepLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  stepLabelActive: {
    fontFamily: "Inter_600SemiBold",
  },
  checkRight: {
    marginLeft: "auto",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  dots: {
    flexDirection: "row",
    gap: 2,
  },
  dot: {
    fontSize: 18,
    lineHeight: 20,
  },
  progressPct: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
});
