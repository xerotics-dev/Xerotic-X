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

const STATUS: Record<string, {
  accent: string;
  cardBg: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  avatarBorder: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
}> = {
  live: {
    accent:      "#16A34A",
    cardBg:      "#F0FDF4",
    badgeBg:     "#DCFCE7",
    badgeText:   "#15803D",
    badgeBorder: "#86EFAC",
    avatarBorder:"#86EFAC",
    icon:        "check-circle",
    label:       "Live",
  },
  dead: {
    accent:      "#DC2626",
    cardBg:      "#FFF5F5",
    badgeBg:     "#FEE2E2",
    badgeText:   "#B91C1C",
    badgeBorder: "#FCA5A5",
    avatarBorder:"#FCA5A5",
    icon:        "cancel",
    label:       "Dead",
  },
  unknown: {
    accent:      "#D97706",
    cardBg:      "#FFFBEB",
    badgeBg:     "#FEF3C7",
    badgeText:   "#B45309",
    badgeBorder: "#FCD34D",
    avatarBorder:"#FCD34D",
    icon:        "help-outline",
    label:       "Unknown",
  },
  pending: {
    accent:      "#94A3B8",
    cardBg:      "#F8FAFC",
    badgeBg:     "#E2E8F0",
    badgeText:   "#475569",
    badgeBorder: "#CBD5E1",
    avatarBorder:"#CBD5E1",
    icon:        "hourglass-empty",
    label:       "Pending",
  },
  checking: {
    accent:      "#94A3B8",
    cardBg:      "#F8FAFC",
    badgeBg:     "#E2E8F0",
    badgeText:   "#475569",
    badgeBorder: "#CBD5E1",
    avatarBorder:"#CBD5E1",
    icon:        "sync",
    label:       "Checking",
  },
};

function stringToColor(str: string): string {
  const palette = ["#1877F2","#E4405F","#0EA5E9","#8B5CF6","#10B981","#F59E0B","#EF4444","#06B6D4"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length] ?? "#1877F2";
}

function Avatar({
  uid, name, pictureUrl, borderColor,
}: {
  uid: string; name?: string; pictureUrl?: string; borderColor: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name
    ? name.split(" ").map((w) => w[0] ?? "").join("").toUpperCase().slice(0, 2)
    : uid.slice(-2).toUpperCase();
  const bgColor = stringToColor(uid);
  const src = pictureUrl ?? `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

  if (imgFailed) {
    return (
      <View style={[styles.avatar, { backgroundColor: bgColor, borderColor, justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      style={[styles.avatar, { borderColor }]}
      contentFit="cover"
      onError={() => setImgFailed(true)}
      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
      transition={300}
    />
  );
}

function LiveBadge({ status }: { status: LiveStatus }) {
  const s = STATUS[status] ?? STATUS.unknown;
  if (status === "checking") {
    return (
      <View style={[styles.badge, { backgroundColor: s.badgeBg, borderColor: s.badgeBorder }]}>
        <ActivityIndicator size="small" color={s.badgeText} style={{ width: 11, height: 11 }} />
        <Text style={[styles.badgeText, { color: s.badgeText }]}>Checking</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: s.badgeBg, borderColor: s.badgeBorder }]}>
      <MaterialIcons name={s.icon} size={12} color={s.badgeText} />
      <Text style={[styles.badgeText, { color: s.badgeText }]}>{s.label}</Text>
    </View>
  );
}

export function UIDListItem({ entry, index, onRemove, onVisited }: Props) {
  const s = STATUS[entry.liveStatus] ?? STATUS.unknown;
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
    <View style={[styles.card, { backgroundColor: isVisited ? "#F1F5F9" : s.cardBg }]}>
      {/* Left accent bar */}
      <View style={[styles.accent, { backgroundColor: s.accent }]} />

      <View style={styles.body}>
        {/* Top row */}
        <View style={styles.topRow}>

          {/* Number */}
          <View style={[styles.numWrap, { backgroundColor: s.badgeBg, borderColor: s.badgeBorder }]}>
            <Text style={[styles.numText, { color: s.badgeText }]}>{index + 1}</Text>
          </View>

          {/* Avatar */}
          <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.8} style={styles.avatarWrap}>
            <Avatar
              uid={entry.uid}
              name={entry.name}
              pictureUrl={entry.pictureUrl}
              borderColor={isVisited ? "#CBD5E1" : s.avatarBorder}
            />
            {isVisited && <View style={styles.avatarDim} />}
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.info}>
            {entry.name ? (
              <Text style={[styles.name, isVisited && styles.nameVisited]} numberOfLines={1}>
                {entry.name}
              </Text>
            ) : (
              <Text style={styles.namePlaceholder} numberOfLines={1}>
                {entry.liveStatus === "checking" ? "Fetching…" : "Unknown User"}
              </Text>
            )}

            {entry.username && entry.username !== entry.uid ? (
              <View style={styles.usernameRow}>
                <MaterialIcons name="alternate-email" size={10} color="#94A3B8" />
                <Text style={[styles.username, isVisited && { opacity: 0.4 }]} numberOfLines={1}>
                  {entry.username}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.7}>
              <Text style={[styles.uid, { color: isVisited ? "#94A3B8" : "#1877F2" }, isVisited && styles.uidVisited]} numberOfLines={1}>
                {entry.uid}
              </Text>
            </TouchableOpacity>

            {entry.password ? (
              <View style={styles.passRow}>
                <MaterialIcons name="vpn-key" size={10} color="#94A3B8" />
                <Text style={[styles.pass, isVisited && { opacity: 0.4 }]} numberOfLines={1}>
                  {entry.password}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Badge */}
          <LiveBadge status={entry.liveStatus} />
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: s.badgeBorder + "55" }]} />

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}
            onPress={handleCopyUID}
            activeOpacity={0.75}
            testID={`copy-uid-${index}`}
          >
            <MaterialIcons name="content-copy" size={12} color="#1D4ED8" />
            <Text style={[styles.actionLabel, { color: "#1D4ED8" }]}>Copy UID</Text>
          </TouchableOpacity>

          {entry.password ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" }]}
              onPress={handleCopyPass}
              activeOpacity={0.75}
              testID={`copy-pass-${index}`}
            >
              <MaterialIcons name="vpn-key" size={12} color="#7C3AED" />
              <Text style={[styles.actionLabel, { color: "#7C3AED" }]}>Copy Pass</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}
            onPress={handleOpenFacebook}
            activeOpacity={0.75}
          >
            <MaterialIcons name="open-in-new" size={12} color="#16A34A" />
            <Text style={[styles.actionLabel, { color: "#16A34A" }]}>Open FB</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {isVisited && (
            <View style={styles.visitedChip}>
              <MaterialIcons name="visibility" size={10} color="#64748B" />
              <Text style={styles.visitedChipText}>Visited</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.removeBtn]}
            onPress={handleRemove}
            activeOpacity={0.75}
            testID={`remove-${index}`}
          >
            <MaterialIcons name="delete-outline" size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  accent: {
    width: 5,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  numWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  numText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
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
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  avatarDim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    color: "#0F172A",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  nameVisited: {
    opacity: 0.4,
    textDecorationLine: "line-through",
  },
  namePlaceholder: {
    fontSize: 12,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  username: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "Inter_500Medium",
  },
  uid: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  uidVisited: {
    textDecorationLine: "line-through",
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
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  divider: {
    height: 1,
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
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  removeBtn: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FCA5A5",
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
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  visitedChipText: {
    fontSize: 10,
    color: "#64748B",
    fontFamily: "Inter_500Medium",
  },
});
