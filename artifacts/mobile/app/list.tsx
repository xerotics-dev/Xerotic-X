import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { StatsBar } from "@/components/StatsBar";
import { UIDListItem } from "@/components/UIDListItem";
import { UIDEntry, useUID } from "@/context/UIDContext";
import { useColors } from "@/hooks/useColors";

type SortMode = "default" | "live" | "dead" | "unknown" | "visited" | "unvisited";

const SORT_OPTIONS: { key: SortMode; label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color?: string }[] = [
  { key: "default", label: "All", icon: "list" },
  { key: "live", label: "Live", icon: "check-circle", color: "#22C55E" },
  { key: "dead", label: "Dead", icon: "cancel", color: "#EF4444" },
  { key: "unknown", label: "Unknown", icon: "help-outline", color: "#F59E0B" },
  { key: "unvisited", label: "Unvisited", icon: "radio-button-unchecked", color: "#60A5FA" },
  { key: "visited", label: "Visited", icon: "visibility", color: "#94A3B8" },
];

export default function ListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    entries,
    stats,
    processing,
    removeEntry,
    markVisited,
    clearAll,
    refreshEntry,
    refreshUnknown,
    exportAsText,
    removeVisited,
    removeDead,
    resetVisited,
  } = useUID();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [showActions, setShowActions] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredEntries = useMemo(() => {
    let list = entries;

    if (sortMode !== "default") {
      list = list.filter((e) => {
        if (sortMode === "live") return e.liveStatus === "live";
        if (sortMode === "dead") return e.liveStatus === "dead";
        if (sortMode === "unknown") return ["unknown", "checking", "pending"].includes(e.liveStatus);
        if (sortMode === "visited") return e.isVisited;
        if (sortMode === "unvisited") return !e.isVisited;
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.uid.includes(q) ||
          e.name?.toLowerCase().includes(q) ||
          e.username?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [entries, sortMode, searchQuery]);

  const handleBack = () => router.back();

  const handleClear = () => {
    Alert.alert(
      "Clear All UIDs?",
      `${entries.length} UIDs will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearAll();
            router.back();
          },
        },
      ]
    );
  };

  const handleRefreshUnknown = async () => {
    const unknownCount = entries.filter((e) => e.liveStatus === "unknown" || !e.name).length;
    if (unknownCount === 0) {
      Alert.alert("All Set", "All UIDs already have profile data fetched.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowActions(false);
    await refreshUnknown();
  };

  const handleExportClipboard = async () => {
    Alert.alert(
      "Copy UIDs",
      "Include passwords in the copy?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "UIDs Only",
          onPress: async () => {
            const text = exportAsText(false);
            await Clipboard.setStringAsync(text);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Copied", `${entries.length} UIDs copied to clipboard.`);
          },
        },
        {
          text: "With Passwords",
          onPress: async () => {
            const text = exportAsText(true);
            await Clipboard.setStringAsync(text);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Copied", `${entries.length} entries copied with passwords.`);
          },
        },
      ]
    );
    setShowActions(false);
  };

  const handleExportFile = async () => {
    try {
      setShowActions(false);
      const text = exportAsText(true);
      const fileName = `fb_uids_${Date.now()}.txt`;
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, text, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/plain",
          dialogTitle: "Export UIDs",
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Saved", `File saved to:\n${fileUri}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Export Error", msg);
    }
  };

  const handleRemoveVisited = () => {
    const visited = entries.filter((e) => e.isVisited).length;
    if (visited === 0) {
      Alert.alert("Nothing to Remove", "No visited UIDs in the list.");
      return;
    }
    Alert.alert(
      "Remove Visited?",
      `${visited} visited UIDs will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            removeVisited();
            setShowActions(false);
          },
        },
      ]
    );
  };

  const handleRemoveDead = () => {
    const dead = entries.filter((e) => e.liveStatus === "dead").length;
    if (dead === 0) {
      Alert.alert("Nothing to Remove", "No dead UIDs in the list.");
      return;
    }
    Alert.alert(
      "Remove Dead?",
      `${dead} dead UIDs will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            removeDead();
            setShowActions(false);
          },
        },
      ]
    );
  };

  const handleResetVisited = () => {
    Alert.alert(
      "Reset Visited Marks?",
      "All visited UIDs will be marked as unvisited.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            resetVisited();
            setShowActions(false);
          },
        },
      ]
    );
  };

  const handleRemove = useCallback((id: string) => removeEntry(id), [removeEntry]);
  const handleVisited = useCallback((id: string) => markVisited(id), [markVisited]);
  const handleRefresh = useCallback((id: string) => refreshEntry(id), [refreshEntry]);

  const renderItem = useCallback(
    ({ item, index }: { item: UIDEntry; index: number }) => (
      <UIDListItem
        entry={item}
        index={index}
        onRemove={handleRemove}
        onVisited={handleVisited}
        onRefresh={handleRefresh}
      />
    ),
    [handleRemove, handleVisited, handleRefresh]
  );

  const keyExtractor = useCallback((item: UIDEntry) => item.id, []);

  const ListEmpty = useCallback(
    () => (
      <View style={styles.empty}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
          <MaterialIcons
            name={searchQuery || sortMode !== "default" ? "search-off" : "inbox"}
            size={56}
            color={colors.mutedForeground}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          {searchQuery || sortMode !== "default" ? "No Matches" : "No UIDs Found"}
        </Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          {searchQuery || sortMode !== "default"
            ? "Try a different filter or clear the search."
            : "Go back and paste UIDs to process them."}
        </Text>
        {!searchQuery && sortMode === "default" && (
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={handleBack}
            activeOpacity={0.85}
          >
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>Add UIDs</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [colors, handleBack, searchQuery, sortMode]
  );

  const ListFooter = useCallback(
    () => (
      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.footerRow}>
          <View style={styles.footerStat}>
            <Text style={[styles.footerStatNum, { color: "#22C55E" }]}>{stats.live}</Text>
            <Text style={[styles.footerStatLabel, { color: colors.mutedForeground }]}>Live</Text>
          </View>
          <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.footerStat}>
            <Text style={[styles.footerStatNum, { color: "#EF4444" }]}>{stats.dead}</Text>
            <Text style={[styles.footerStatLabel, { color: colors.mutedForeground }]}>Dead</Text>
          </View>
          <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.footerStat}>
            <Text style={[styles.footerStatNum, { color: "#F59E0B" }]}>{stats.unknown}</Text>
            <Text style={[styles.footerStatLabel, { color: colors.mutedForeground }]}>Unknown</Text>
          </View>
          <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.footerStat}>
            <Text style={[styles.footerStatNum, { color: "#94A3B8" }]}>{stats.visited}</Text>
            <Text style={[styles.footerStatLabel, { color: colors.mutedForeground }]}>Visited</Text>
          </View>
        </View>
        {stats.duplicatesRemoved > 0 && (
          <Text style={[styles.footerDups, { color: colors.mutedForeground }]}>
            {stats.duplicatesRemoved} duplicates removed during processing
          </Text>
        )}
      </View>
    ),
    [stats, colors]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {processing.isProcessing && (
        <ProcessingOverlay
          visible={processing.isProcessing}
          step={processing.step}
          progress={processing.progress}
          stepIndex={processing.stepIndex}
        />
      )}

      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: topPad + 8,
          },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>UID List</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {filteredEntries.length} of {entries.length} entries
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setShowActions((v) => !v);
          }}
          style={[styles.menuBtn, { backgroundColor: colors.secondary }]}
          activeOpacity={0.7}
        >
          <MaterialIcons name={showActions ? "close" : "more-vert"} size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Action Menu */}
      {showActions && (
        <View style={[styles.actionMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.actionItem} onPress={handleRefreshUnknown} activeOpacity={0.6}>
            <MaterialIcons name="refresh" size={20} color="#22C55E" />
            <Text style={[styles.actionItemText, { color: colors.foreground }]}>Refresh Unknown / Failed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={handleExportClipboard} activeOpacity={0.6}>
            <MaterialIcons name="content-copy" size={20} color="#60A5FA" />
            <Text style={[styles.actionItemText, { color: colors.foreground }]}>Copy All to Clipboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={handleExportFile} activeOpacity={0.6}>
            <MaterialIcons name="file-download" size={20} color="#A78BFA" />
            <Text style={[styles.actionItemText, { color: colors.foreground }]}>Export to .txt File</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.actionItem} onPress={handleRemoveVisited} activeOpacity={0.6}>
            <MaterialIcons name="delete-sweep" size={20} color="#F59E0B" />
            <Text style={[styles.actionItemText, { color: colors.foreground }]}>Remove Visited UIDs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={handleRemoveDead} activeOpacity={0.6}>
            <MaterialIcons name="delete-forever" size={20} color="#EF4444" />
            <Text style={[styles.actionItemText, { color: colors.foreground }]}>Remove Dead UIDs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={handleResetVisited} activeOpacity={0.6}>
            <MaterialIcons name="restore" size={20} color="#60A5FA" />
            <Text style={[styles.actionItemText, { color: colors.foreground }]}>Reset Visited Marks</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.actionItem} onPress={handleClear} activeOpacity={0.6}>
            <MaterialIcons name="warning" size={20} color="#EF4444" />
            <Text style={[styles.actionItemText, { color: "#EF4444" }]}>Clear Entire List</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.card, borderColor: searchQuery ? colors.primary + "55" : colors.border },
          ]}
        >
          <MaterialIcons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by UID, name, or username..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
              <MaterialIcons name="cancel" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter Chips */}
      <FlatList
        horizontal
        data={SORT_OPTIONS}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
        renderItem={({ item }) => {
          const active = sortMode === item.key;
          const color = item.color ?? colors.primary;
          return (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setSortMode(item.key);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? color + "22" : colors.card,
                  borderColor: active ? color + "88" : colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={item.icon}
                size={13}
                color={active ? color : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.chipText,
                  { color: active ? color : colors.mutedForeground },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={<View style={{ width: 12 }} />}
      />

      <StatsBar stats={stats} />

      <FlatList
        data={filteredEntries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={filteredEntries.length > 0 ? ListFooter : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: btmPad + 20 },
          filteredEntries.length === 0 && styles.emptyContainer,
        ]}
        initialNumToRender={12}
        maxToRenderPerBatch={15}
        windowSize={10}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  actionMenu: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  actionItemText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  actionDivider: { height: 1, marginHorizontal: 16 },
  searchWrap: { paddingHorizontal: 12, paddingTop: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  chipsContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: 12, paddingTop: 6 },
  emptyContainer: { flex: 1 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    padding: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  footer: {
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  footerStat: { alignItems: "center", flex: 1 },
  footerStatNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  footerStatLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2 },
  footerDivider: { width: 1, height: 28 },
  footerDups: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    fontStyle: "italic",
  },
});
