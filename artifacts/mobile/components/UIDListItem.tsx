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

const STATUS_COLOR: Record<string, string> = {
  live:     "#22C55E",
  dead:     "#EF4444",
  unknown:  "#F59E0B",
  pending:  "#6B7280",
  checking: "#6B7280",
};

const BADGE_MAP: Record<string, { bg: string; label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }> = {
  live:     { bg: "#22C55E", label: "Live",    icon: "check-circle"   },
  dead:     { bg: "#EF4444", label: "Dead",    icon: "cancel"         },
  unknown:  { bg: "#F59E0B", label: "?",       icon: "help"           },
  pending:  { bg: "#94A3B8", label: "...",     icon: "hourglass-empty"},
  checking: { bg: "#94A3B8", label: "...",     icon: "sync"           },
};

function stringToColor(str: string): string {
  const palette = ["#1877F2","#E4405F","#0EA5E9","#8B5CF6","#10B981","#F59E0B","#EF4444","#06B6D4"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length] ?? "#1877F2";
}

function Avatar({ uid, name, pictureUrl }: { uid: string; name?: string; pictureUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name
    ? name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2)
    : uid.slice(-2).toUpperCase();
  const bgColor = stringToColor(uid);
  const src = pictureUrl ?? `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

  if (imgFailed) {
    return (
      <View style={[styles.avatar, { backgroundColor: bgColor, justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
    );
  }
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

function LiveBadge({ status }: { status: LiveStatus }) {
  if (status === "checking") {
    return (
      <View style={[styles.badge, { backgroundColor: "#94A3B8" }]}>
        <ActivityIndicator size="small" color="#fff" style={{ width: 10, height: 10 }} />
        <Text style={styles.badgeText}>Checking</Text>
      </View>
    );
  }
  const s = BADGE_MAP[status] ?? BADGE_MAP.unknown;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <MaterialIcons name={s.icon} size={11} color="#fff" />
      <Text style={styles.badgeText}>{s.label}</Text>
    </View>
  );
}

export function UIDListItem({ entry, index, onRemove, onVisited }: Props) {
  const accentColor = STATUS_COLOR[entry.liveStatus] ?? "#94A3B8";
  const isVisited = entry.isVisited;

  const handleOpenFacebook = useCallback(async () => {
    onVisited(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://www.facebook.com/profile.php?id=${entry.uid}`;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert("Cannot open", "Facebook link could not be opened.");
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

  return (
    <View style={[styles.card, isVisited && styles.cardVisited]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.numBadge}>#{index + 1}</Text>

          <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.8} style={styles.avatarWrap}>
            <Avatar uid={entry.uid} name={entry.name} pictureUrl={entry.pictureUrl} />
            {isVisited && <View style={styles.avatarDim} />}
          </TouchableOpacity>

          <View style={styles.info}>
            {entry.name ? (
              <Text
                style={[styles.name, isVisited && styles.nameVisited]}
                numberOfLines={1}
              >
                {entry.name}
              </Text>
            ) : (
              <Text style={styles.namePlaceholder} numberOfLines={1}>
                {entry.liveStatus === "checking" ? "Fetching…" : "Unknown User"}
              </Text>
            )}

            <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.7}>
              <Text style={[styles.uid, isVisited && styles.uidVisited]} numberOfLines={1}>
                {entry.uid}
              </Text>
            </TouchableOpacity>

            {entry.password ? (
              <View style={styles.passRow}>
                <MaterialIcons name="vpn-key" size={10} color="#94A3B8" />
                <Text style={[styles.pass, isVisited && { opacity: 0.45 }]} numberOfLines={1}>
                  {entry.password}
                </Text>
              </View>
            ) : null}
          </View>

          <LiveBadge status={entry.liveStatus} />
        </View>

        <View style={styles.divider} />

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBlue]} onPress={handleCopyUID} activeOpacity={0.75} testID={`copy-uid-${index}`}>
            <MaterialIcons name="content-copy" size={13} color="#1877F2" />
            <Text style={[styles.actionLabel, { color: "#1877F2" }]}>Copy UID</Text>
          </TouchableOpacity>

          {entry.password ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionPurple]} onPress={handleCopyPass} activeOpacity={0.75} testID={`copy-pass-${index}`}>
              <MaterialIcons name="vpn-key" size={13} color="#8B5CF6" />
              <Text style={[styles.actionLabel, { color: "#8B5CF6" }]}>Copy Pass</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={[styles.actionBtn, styles.actionFB]} onPress={handleOpenFacebook} activeOpacity={0.75}>
            <MaterialIcons name="open-in-new" size={13} color="#0A66C2" />
            <Text style={[styles.actionLabel, { color: "#0A66C2" }]}>Open FB</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {isVisited && (
            <View style={styles.visitedChip}>
              <MaterialIcons name="visibility" size={10} color="#60A5FA" />
              <Text style={styles.visitedChipText}>Visited</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={handleRemove} activeOpacity={0.75} testID={`remove-${index}`}>
            <MaterialIcons name="delete-outline" size={13} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 0,
    marginBottom: 10,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardVisited: {
    backgroundColor: "#F8FAFC",
  },
  accent: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 9,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  numBadge: {
    fontSize: 11,
    color: "#CBD5E1",
    fontFamily: "Inter_600SemiBold",
    minWidth: 24,
    textAlign: "center",
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E2E8F0",
    borderWidth: 2,
    borderColor: "#DBEAFE",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  avatarDim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 14,
    color: "#0F172A",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  nameVisited: {
    opacity: 0.45,
    textDecorationLine: "line-through",
  },
  namePlaceholder: {
    fontSize: 12,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  uid: {
    fontSize: 12,
    color: "#1877F2",
    fontFamily: "Inter_600SemiBold",
  },
  uidVisited: {
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
    color: "#64748B",
    fontFamily: "Inter_400Regular",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 9,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBlue: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  actionPurple: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  actionFB: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BAE6FD",
  },
  actionRed: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    paddingHorizontal: 7,
  },
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  visitedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
  },
  visitedChipText: {
    fontSize: 10,
    color: "#60A5FA",
    fontFamily: "Inter_500Medium",
  },
});
