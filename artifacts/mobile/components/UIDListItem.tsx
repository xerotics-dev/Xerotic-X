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
import { useColors } from "@/hooks/useColors";

interface Props {
  entry: UIDEntry;
  index: number;
  onRemove: (id: string) => void;
  onVisited: (id: string) => void;
}

const STATUS_META: Record<string, {
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
    accent:      "#22C55E",
    cardBg:      "#0A2116",
    badgeBg:     "#0D2B1C",
    badgeText:   "#4ADE80",
    badgeBorder: "#166534",
    avatarBorder:"#22C55E",
    icon:        "check-circle",
    label:       "Live",
  },
  dead: {
    accent:      "#EF4444",
    cardBg:      "#210A0A",
    badgeBg:     "#2B0A0A",
    badgeText:   "#F87171",
    badgeBorder: "#7F1D1D",
    avatarBorder:"#EF4444",
    icon:        "cancel",
    label:       "Dead",
  },
  unknown: {
    accent:      "#F59E0B",
    cardBg:      "#1C1500",
    badgeBg:     "#261A00",
    badgeText:   "#FCD34D",
    badgeBorder: "#92400E",
    avatarBorder:"#F59E0B",
    icon:        "help-outline",
    label:       "Unknown",
  },
  pending: {
    accent:      "#475569",
    cardBg:      "#1A1D2E",
    badgeBg:     "#252840",
    badgeText:   "#94A3B8",
    badgeBorder: "#334155",
    avatarBorder:"#475569",
    icon:        "hourglass-empty",
    label:       "Pending",
  },
  checking: {
    accent:      "#1877F2",
    cardBg:      "#0D1A33",
    badgeBg:     "#172038",
    badgeText:   "#60A5FA",
    badgeBorder: "#1D4ED8",
    avatarBorder:"#1877F2",
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
  const s = STATUS_META[status] ?? STATUS_META.unknown;
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
  const colors = useColors();
  const s = STATUS_META[entry.liveStatus] ?? STATUS_META.unknown;
  const isVisited = entry.isVisited;
  const cardBg = isVisited ? "#13151F" : s.cardBg;

  const handleOpenFacebook = useCallback(async () => {
    onVisited(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://www.facebook.com/profile.php?id=${entry.uid}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Could not open Facebook. Please try again.");
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
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: s.badgeBorder + "55" }]}>
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
              borderColor={isVisited ? "#334155" : s.avatarBorder}
            />
            {isVisited && <View style={styles.avatarDim} />}
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.info}>
            {entry.name ? (
              <Text
                style={[styles.name, { color: isVisited ? "#64748B" : colors.foreground }, isVisited && styles.nameVisited]}
                numberOfLines={1}
              >
                {entry.name}
              </Text>
            ) : (
              <Text style={styles.namePlaceholder} numberOfLines={1}>
                {entry.liveStatus === "checking" ? "Fetching…" : "Unknown User"}
              </Text>
            )}

            {entry.username && entry.username !== entry.uid ? (
              <View style={styles.usernameRow}>
                <MaterialIcons name="alternate-email" size={10} color="#475569" />
                <Text style={[styles.username, isVisited && { opacity: 0.4 }]} numberOfLines={1}>
                  {entry.username}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity onPress={handleOpenFacebook} activeOpacity={0.7}>
              <Text
                style={[styles.uid, { color: isVisited ? "#334155" : "#60A5FA" }, isVisited && styles.uidVisited]}
                numberOfLines={1}
              >
                {entry.uid}
              </Text>
            </TouchableOpacity>

            {entry.password ? (
              <View style={styles.passRow}>
                <MaterialIcons name="vpn-key" size={10} color="#475569" />
                <Text style={[styles.pass, isVisited && { opacity: 0.4 }]} numberOfLines={1}>
                  {entry.password}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Status badge */}
          <LiveBadge status={entry.liveStatus} />
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: s.badgeBorder + "44" }]} />

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#0D1A33", borderColor: "#1D4ED8" }]}
            onPress={handleCopyUID}
            activeOpacity={0.75}
            testID={`copy-uid-${index}`}
          >
            <MaterialIcons name="content-copy" size={12} color="#60A5FA" />
            <Text style={[styles.actionLabel, { color: "#60A5FA" }]}>Copy UID</Text>
          </TouchableOpacity>

          {entry.password ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#1A0D2E", borderColor: "#6D28D9" }]}
              onPress={handleCopyPass}
              activeOpacity={0.75}
              testID={`copy-pass-${index}`}
            >
              <MaterialIcons name="vpn-key" size={12} color="#A78BFA" />
              <Text style={[styles.actionLabel, { color: "#A78BFA" }]}>Copy Pass</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#0A2116", borderColor: "#166534" }]}
            onPress={handleOpenFacebook}
            activeOpacity={0.75}
          >
            <MaterialIcons name="open-in-new" size={12} color="#4ADE80" />
            <Text style={[styles.actionLabel, { color: "#4ADE80" }]}>Open FB</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {isVisited && (
            <View style={[styles.visitedChip, { backgroundColor: "#1A1D2E", borderColor: "#334155" }]}>
              <MaterialIcons name="visibility" size={10} color="#475569" />
              <Text style={[styles.visitedChipText, { color: "#475569" }]}>Visited</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#210A0A", borderColor: "#7F1D1D", paddingHorizontal: 8 }]}
            onPress={handleRemove}
            activeOpacity={0.75}
            testID={`remove-${index}`}
          >
            <MaterialIcons name="delete-outline" size={14} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  accent: {
    width: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 9,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  numWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
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
    backgroundColor: "#252840",
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
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  nameVisited: {
    textDecorationLine: "line-through",
  },
  namePlaceholder: {
    fontSize: 12,
    color: "#475569",
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
    paddingHorizontal: 7,
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
    marginVertical: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  visitedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  visitedChipText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});
