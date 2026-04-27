import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatsBar } from "@/components/StatsBar";
import { UIDListItem } from "@/components/UIDListItem";
import { UIDEntry, useUID } from "@/context/UIDContext";
import { useColors } from "@/hooks/useColors";

export default function ListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { entries, stats, removeEntry, markVisited, clearAll } = useUID();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleBack = () => {
    router.back();
  };

  const handleClear = () => {
    Alert.alert(
      "Clear All",
      "All UIDs will be removed from the list. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
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

  const handleRemove = useCallback(
    (id: string) => {
      removeEntry(id);
    },
    [removeEntry]
  );

  const handleVisited = useCallback(
    (id: string) => {
      markVisited(id);
    },
    [markVisited]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: UIDEntry; index: number }) => (
      <UIDListItem
        entry={item}
        index={index}
        onRemove={handleRemove}
        onVisited={handleVisited}
      />
    ),
    [handleRemove, handleVisited]
  );

  const keyExtractor = useCallback((item: UIDEntry) => item.id, []);

  const ListFooter = useCallback(
    () => (
      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          Total {stats.total}  ·  Live {stats.live}  ·  Dead {stats.dead}  ·  Unknown {stats.unknown}
        </Text>
        {stats.duplicatesRemoved > 0 && (
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            {stats.duplicatesRemoved} duplicates removed
          </Text>
        )}
      </View>
    ),
    [stats, colors]
  );

  const ListEmpty = useCallback(
    () => (
      <View style={styles.empty}>
        <MaterialIcons name="inbox" size={56} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          No UIDs Found
        </Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Go back and paste UIDs to process them.
        </Text>
        <TouchableOpacity
          style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
          onPress={handleBack}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    ),
    [colors, handleBack]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.7}
          testID="back-btn"
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            UID List
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {entries.length} entries
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleClear}
          style={[styles.clearBtn, { backgroundColor: colors.destructive + "22" }]}
          activeOpacity={0.7}
          testID="clear-btn"
        >
          <MaterialIcons name="delete-sweep" size={18} color={colors.destructive} />
          <Text style={[styles.clearBtnText, { color: colors.destructive }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <StatsBar stats={stats} />

      <FlatList
        data={entries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={entries.length > 0 ? ListFooter : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: btmPad + 20 },
          entries.length === 0 && styles.emptyContainer,
        ]}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  clearBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  emptyContainer: {
    flex: 1,
  },
  footer: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  footerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
