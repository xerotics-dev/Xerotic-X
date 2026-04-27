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

function Avatar({ uid, name, pictureUrl }: { uid: string; name?: string; pictureUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false);

  const initials = name
    ? name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2)
    : uid.slice(-2);

  const bgColor = stringToColor(uid);

  const Fallback = (
    <View style={[styles.avatarFallback, { backgroundColor: bgColor }]}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );

  const src = pictureUrl ?? `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

  if (imgFailed) return Fallback;

  return (
    <Image
      source={{ uri: src }}
      style={styles.avatar}
      contentFit="cover"
      onError={() => setImgFailed(true)}
      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
      transition={300}
    />
  );
}

function stringToColor(str: string): string {
  const palette = [
    "#1877F2", "#E4405F", "#0EA5E9", "#8B5CF6",
    "#10B981", "#F59E0B", "#EF4444", "#06B6D4",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length] ?? "#1877F2";
}

function LiveBadge({ status }: { status: LiveStatus }) {
  if (status === "checking") {
    return (
      <View style={[styles.badge, { backgroundColor: "#6B7280" }]}>
        <ActivityIndicator size="small" color="#fff" style={{ width: 12, height: 12 }} />
      </View>
    );
  }
  const s = BADGE_MAP[status] ?? BADGE_MAP.unknown;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <MaterialIcons name={s.icon} size={12} color="#fff" />
      <Text style={styles.badgeText}>{s.label}</Text>
    </View>
  );
}

const BADGE_MAP: Record<
  string,
  { bg: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string }
> = {
  live:    { bg: "#22C55E", icon: "check-circle",   label: "Live" },
  dead:    { bg: "#EF4444", icon: "cancel",          label: "Dead" },
  unknown: { bg: "#F59E0B", icon: "help",            label: "?"    },
  pending: { bg: "#6B7280", icon: "hourglass-empty", label: "..."  },
  checking:{ bg: "#6B7280", icon: "sync",            label: "..."  },
};

function Btn({
  icon, label, color, onPress, testID,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, { borderColor: color + "55" }]}
      activeOpacity={0.72}
      testID={testID}
    >
      <MaterialIcons name={icon} size={13} color={color} />
      <Text style={[styles.btnLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function UIDListItem({ entry, index, onRemove, onVisited }: Props) {
  const handleOpenFacebook = useCallback(async () => {
    onVisited(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://www.facebook.com/profile.php?id=${entry.uid}`;
    try {
      if (await Linking.canOpenURL(url)) {
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
    <View style={[styles.container, isVisited && styles.visitedBg]}>
      <View style={styles.row}>
        <Text style={styles.num}>{index + 1}</Text>

        <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.85} style={styles.avatarWrap}>
          <Avatar uid={entry.uid} name={entry.name} pictureUrl={entry.pictureUrl} />
          {isVisited && <View style={styles.avatarDim} />}
        </TouchableOpacity>

        <View style={styles.info}>
          {entry.name ? (
            <Text style={[styles.name, isVisited && styles.faded]} numberOfLines={1}>
              {entry.name}
            </Text>
          ) : (
            <Text style={styles.namePlaceholder} numberOfLines={1}>
              {entry.liveStatus === "checking" ? "Fetching name..." : "Unknown User"}
            </Text>
          )}

          <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.7}>
            <Text style={[styles.uid, isVisited && styles.strikeUid]} numberOfLines={1}>
              {entry.uid}
            </Text>
          </TouchableOpacity>

          {entry.password ? (
            <View style={styles.passRow}>
              <MaterialIcons name="vpn-key" size={10} color="#9CA3AF" />
              <Text style={[styles.pass, isVisited && styles.faded]} numberOfLines={1}>
                {entry.password}
              </Text>
            </View>
          ) : null}
        </View>

        <LiveBadge status={entry.liveStatus} />
      </View>

      <View style={styles.actions}>
        <Btn icon="content-copy" label="Copy UID"  color="#1877F2" onPress={handleCopyUID}  testID={`copy-uid-${index}`} />
        {entry.password ? (
          <Btn icon="vpn-key" label="Copy Pass" color="#8B5CF6" onPress={handleCopyPass} testID={`copy-pass-${index}`} />
        ) : null}
        <Btn icon="delete-outline" label="Remove" color="#EF4444" onPress={handleRemove} testID={`remove-${index}`} />
        {isVisited && (
          <View style={styles.visitedTag}>
            <MaterialIcons name="visibility" size={10} color="#60A5FA" />
            <Text style={styles.visitedTagText}>Visited</Text>
          </View>
        )}
      </View>

      {isVisited && <View style={styles.strikeLine} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    position: "relative",
    overflow: "hidden",
  },
  visitedBg: {
    backgroundColor: "#F8FAFC",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  num: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Inter_500Medium",
    minWidth: 20,
    textAlign: "right",
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#DBEAFE",
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  avatarDim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    color: "#111827",
    fontFamily: "Inter_700Bold",
  },
  namePlaceholder: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  faded: {
    opacity: 0.45,
  },
  uid: {
    fontSize: 13,
    color: "#1877F2",
    fontFamily: "Inter_600SemiBold",
  },
  strikeUid: {
    textDecorationLine: "line-through",
    opacity: 0.4,
  },
  passRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pass: {
    fontSize: 11,
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
    fontFamily: "Inter_700Bold",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    marginLeft: 78,
    flexWrap: "wrap",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#F9FAFB",
  },
  btnLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  visitedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    marginLeft: "auto",
  },
  visitedTagText: {
    fontSize: 10,
    color: "#60A5FA",
    fontFamily: "Inter_500Medium",
  },
  strikeLine: {
    position: "absolute",
    left: 60,
    right: 12,
    top: "38%",
    height: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
});
