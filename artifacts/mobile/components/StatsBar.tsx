import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { Stats } from "@/context/UIDContext";

interface StatItemProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: number;
  color: string;
}

function StatItem({ icon, label, value, color }: StatItemProps) {
  const colors = useColors();
  return (
    <View style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={18} color={color} />
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

interface Props {
  stats: Stats;
}

export function StatsBar({ stats }: Props) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <StatItem icon="format-list-numbered" label="Total" value={stats.total} color={colors.primary} />
      <StatItem icon="check-circle" label="Live" value={stats.live} color={colors.success} />
      <StatItem icon="cancel" label="Dead" value={stats.dead} color={colors.destructive} />
      <StatItem icon="help" label="Unknown" value={stats.unknown} color={colors.warning} />
      <StatItem icon="visibility" label="Visited" value={stats.visited} color={colors.info} />
      <StatItem icon="content-cut" label="Removed" value={stats.duplicatesRemoved} color={colors.mutedForeground} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  item: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
    minWidth: 72,
  },
  value: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
