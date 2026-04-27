import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

function getFbPictureUrl(uid: string) {
  return `https://graph.facebook.com/${uid}/picture?type=normal&width=80&height=80`;
}

function Avatar({ uid, name }: { uid: string; name?: string }) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : uid.slice(-2);

  if (imgError) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: getFbPictureUrl(uid) }}
      style={styles.avatar}
      contentFit="cover"
      onError={() => setImgError(true)}
      placeholder={
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
      }
    />
  );
}

function LiveBadge({ status }: { status: LiveStatus }) {
  const style = badgeStyles[status] ?? badgeStyles.unknown;
  if (status === "checking") {
    return (
      <View style={[styles.badge, { backgroundColor: "#374151" }]}>
        <ActivityIndicator
          size="small"
          color="#fff"
          style={{ width: 14, height: 14 }}
        />
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <MaterialIcons name={style.icon} size={12} color="#fff" />
      <Text style={styles.badgeText}>{style.label}</Text>
    </View>
  );
}

const badgeStyles: Record<
  string,
  {
    bg: string;
    icon: React.ComponentProps<typeof MaterialIcons>["name"];
    label: string;
  }
> = {
  live: { bg: "#22C55E", icon: "check-circle", label: "Live" },
  dead: { bg: "#EF4444", icon: "cancel", label: "Dead" },
  unknown: { bg: "#F59E0B", icon: "help", label: "?" },
  pending: { bg: "#6B7280", icon: "hourglass-empty", label: "..." },
  checking: { bg: "#6B7280", icon: "sync", label: "..." },
};

function ActionBtn({
  icon,
  color,
  label,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  color: string;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionBtn, { borderColor: color + "44" }]}
      activeOpacity={0.7}
      testID={testID}
    >
      <MaterialIcons name={icon} size={13} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
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
      {isVisited && <View style={styles.visitedOverlay} />}

      <View style={styles.mainRow}>
        <Text style={styles.num}>{index + 1}.</Text>

        <TouchableOpacity
          onPress={handleOpenFacebook}
          activeOpacity={0.8}
          style={styles.avatarWrap}
        >
          <Avatar uid={entry.uid} name={entry.name} />
          {isVisited && <View style={styles.avatarVisitedDim} />}
        </TouchableOpacity>

        <View style={styles.infoBlock}>
          {entry.name ? (
            <Text
              style={[styles.name, isVisited && styles.visitedText]}
              numberOfLines={1}
            >
              {entry.name}
            </Text>
          ) : (
            <Text style={styles.namePlaceholder} numberOfLines={1}>
              Facebook User
            </Text>
          )}

          <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.7}>
            <Text
              style={[styles.uid, isVisited && styles.strikethrough]}
              numberOfLines={1}
            >
              {entry.uid}
            </Text>
          </TouchableOpacity>

          {entry.password ? (
            <View style={styles.passRow}>
              <MaterialIcons name="vpn-key" size={11} color="#9CA3AF" />
              <Text
                style={[styles.password, isVisited && styles.strikethrough]}
                numberOfLines={1}
              >
                {entry.password}
              </Text>
            </View>
          ) : null}
        </View>

        <LiveBadge status={entry.liveStatus} />
      </View>

      <View style={styles.actionsRow}>
        <ActionBtn
          icon="content-copy"
          color="#1877F2"
          label="Copy UID"
          onPress={handleCopyUID}
          testID={`copy-uid-${index}`}
        />
        {entry.password ? (
          <ActionBtn
            icon="vpn-key"
            color="#8B5CF6"
            label="Copy Pass"
            onPress={handleCopyPass}
            testID={`copy-pass-${index}`}
          />
        ) : null}
        <ActionBtn
          icon="delete-outline"
          color="#EF4444"
          label="Remove"
          onPress={handleRemove}
          testID={`remove-${index}`}
        />
        {isVisited ? (
          <View style={styles.visitedPill}>
            <MaterialIcons name="visibility" size={11} color="#60A5FA" />
            <Text style={styles.visitedPillText}>Visited</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  visitedContainer: {
    backgroundColor: "#F8FAFC",
  },
  visitedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.03)",
    zIndex: 0,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  num: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Inter_500Medium",
    minWidth: 22,
    textAlign: "right",
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#1877F222",
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1877F2",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  avatarVisitedDim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  infoBlock: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: 14,
    color: "#111827",
    fontFamily: "Inter_600SemiBold",
  },
  namePlaceholder: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  uid: {
    fontSize: 13,
    color: "#1877F2",
    fontFamily: "Inter_500Medium",
  },
  strikethrough: {
    textDecorationLine: "line-through",
    opacity: 0.45,
  },
  visitedText: {
    opacity: 0.5,
  },
  passRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    paddingHorizontal: 7,
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
    marginLeft: 76,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#F9FAFB",
  },
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  visitedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    marginLeft: "auto",
  },
  visitedPillText: {
    fontSize: 11,
    color: "#60A5FA",
    fontFamily: "Inter_500Medium",
  },
});
