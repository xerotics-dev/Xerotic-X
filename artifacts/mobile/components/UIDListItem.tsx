import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LiveStatus, UIDEntry } from "@/context/UIDContext";

interface Props {
  entry: UIDEntry;
  index: number;
  onRemove: (id: string) => void;
  onVisited: (id: string) => void;
}

function LiveBadge({ status }: { status: LiveStatus }) {
  const style = badgeStyles[status] ?? badgeStyles.unknown;
  if (status === "checking") {
    return (
      <View style={[styles.badge, { backgroundColor: "#374151" }]}>
        <ActivityIndicator size="small" color="#fff" style={{ width: 14, height: 14 }} />
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <MaterialIcons name={style.icon} size={13} color="#fff" />
      <Text style={styles.badgeText}>{style.label}</Text>
    </View>
  );
}

const badgeStyles: Record<
  string,
  { bg: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string }
> = {
  live: { bg: "#22C55E", icon: "check-circle", label: "Live" },
  dead: { bg: "#EF4444", icon: "cancel", label: "Dead" },
  unknown: { bg: "#F59E0B", icon: "help", label: "?" },
  pending: { bg: "#374151", icon: "hourglass-empty", label: "..." },
  checking: { bg: "#374151", icon: "sync", label: "..." },
};

function ActionBtn({
  icon,
  color,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionBtn, { borderColor: color + "55" }]}
      activeOpacity={0.7}
      testID={testID}
    >
      <MaterialIcons name={icon} size={14} color={color} />
    </TouchableOpacity>
  );
}

export function UIDListItem({ entry, index, onRemove, onVisited }: Props) {
  const handleOpenFacebook = useCallback(async () => {
    onVisited(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://www.facebook.com/profile.php?id=${entry.uid}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Cannot open", "Facebook link could not be opened.");
      }
    } catch {
      Alert.alert("Error", "Could not open Facebook.");
    }
  }, [entry.id, entry.uid, onVisited]);

  const handleCopyUID = useCallback(async () => {
    await Clipboard.setStringAsync(entry.uid);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [entry.uid]);

  const handleCopyPass = useCallback(async () => {
    if (entry.password) {
      await Clipboard.setStringAsync(entry.password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [entry.password]);

  const handleRemove = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRemove(entry.id);
  }, [entry.id, onRemove]);

  const isVisited = entry.isVisited;

  return (
    <View style={[styles.container, isVisited && styles.visitedContainer]}>
      <View style={styles.topRow}>
        <Text style={styles.num}>{index + 1}.</Text>

        <View style={styles.uidBlock}>
          <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.7}>
            <Text
              style={[styles.uid, isVisited && styles.strikethrough]}
              numberOfLines={1}
            >
              {entry.uid}
            </Text>
          </TouchableOpacity>
          {entry.password ? (
            <Text style={[styles.password, isVisited && styles.strikethrough]} numberOfLines={1}>
              {entry.password}
            </Text>
          ) : null}
        </View>

        <LiveBadge status={entry.liveStatus} />
      </View>

      <View style={styles.actionsRow}>
        <ActionBtn
          icon="content-copy"
          color="#1877F2"
          onPress={handleCopyUID}
          testID={`copy-uid-${index}`}
        />
        {entry.password ? (
          <ActionBtn
            icon="vpn-key"
            color="#8B5CF6"
            onPress={handleCopyPass}
            testID={`copy-pass-${index}`}
          />
        ) : null}
        <ActionBtn
          icon="delete-outline"
          color="#EF4444"
          onPress={handleRemove}
          testID={`remove-${index}`}
        />
        {isVisited ? (
          <View style={styles.visitedPill}>
            <MaterialIcons name="visibility" size={12} color="#60A5FA" />
            <Text style={styles.visitedText}>Visited</Text>
          </View>
        ) : null}
      </View>

      {isVisited && <View style={styles.visitedLine} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  visitedContainer: {
    backgroundColor: "#F9FAFB",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  num: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "Inter_500Medium",
    minWidth: 28,
    marginTop: 2,
  },
  uidBlock: {
    flex: 1,
    gap: 2,
  },
  uid: {
    fontSize: 15,
    color: "#1877F2",
    fontFamily: "Inter_600SemiBold",
    textDecorationLine: "none",
  },
  strikethrough: {
    textDecorationLine: "line-through",
    opacity: 0.5,
  },
  password: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "Inter_400Regular",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginLeft: 36,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  visitedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    marginLeft: "auto",
  },
  visitedText: {
    fontSize: 11,
    color: "#60A5FA",
    fontFamily: "Inter_500Medium",
  },
  visitedLine: {
    position: "absolute",
    left: 14,
    right: 14,
    top: "50%",
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
});
