import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { useUID } from "@/context/UIDContext";
import { useColors } from "@/hooks/useColors";

const EXAMPLE = `100012345678901
100098765432109|password123
61551234567890`;

export default function InputScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { parseAndProcess, processing, entries } = useUID();

  const [inputText, setInputText] = useState("");
  const [hasProcessed, setHasProcessed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 9, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (hasProcessed && !processing.isProcessing) {
      setHasProcessed(false);
      setInputText("");
      if (entries.length > 0) {
        router.push("/list");
      }
    }
  }, [processing.isProcessing, hasProcessed, entries.length]);

  const startProcess = async (mode: "replace" | "append") => {
    const text = inputText.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHasProcessed(true);
    await parseAndProcess(text, mode);
  };

  const handleProcess = async () => {
    const text = inputText.trim();
    if (!text) {
      Alert.alert("Empty Input", "Please paste UIDs or import a file.");
      return;
    }

    if (entries.length > 0) {
      Alert.alert(
        "Existing List Found",
        `You already have ${entries.length} UIDs. What do you want to do?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add to List", onPress: () => startProcess("append") },
          { text: "Replace All", style: "destructive", onPress: () => startProcess("replace") },
        ]
      );
    } else {
      await startProcess("replace");
    }
  };

  const handleImportFile = async () => {
    try {
      // Allow ALL file types - prevents Android picker from hiding non-recognized .txt files
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.name?.toLowerCase() ?? "";
      const mimeType = asset.mimeType?.toLowerCase() ?? "";

      // Reject obviously binary files
      const isLikelyBinary =
        /\.(jpg|jpeg|png|gif|mp4|mp3|pdf|zip|exe|apk|doc|docx|xlsx|ppt|pptx)$/i.test(fileName) ||
        mimeType.startsWith("image/") ||
        mimeType.startsWith("video/") ||
        mimeType.startsWith("audio/");

      if (isLikelyBinary) {
        Alert.alert(
          "Unsupported File",
          "Please select a text file (.txt, .csv) containing UIDs."
        );
        return;
      }

      let content = "";
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        content = await response.text();
      } else {
        content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (!content.trim()) {
        Alert.alert("Empty File", "The selected file is empty.");
        return;
      }

      // Quick validation - check if any line looks like a UID
      const lines = content.split(/[\n\r,;]+/).map((l) => l.trim()).filter(Boolean);
      const numericLines = lines.filter((l) => /^\d+/.test(l.split("|")[0] ?? ""));

      if (numericLines.length === 0) {
        Alert.alert(
          "No UIDs Found",
          "The file doesn't contain any numeric UIDs. Make sure each line starts with a number."
        );
        return;
      }

      setInputText((prev) => (prev ? prev + "\n" + content : content));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Imported", `Found ${numericLines.length} potential UIDs from ${asset.name ?? "file"}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Import Error", `Could not read the file.\n\n${msg}`);
    }
  };

  const handleViewList = () => {
    Haptics.selectionAsync();
    router.push("/list");
  };

  const handleClearInput = () => {
    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePasteSample = () => {
    setInputText(EXAMPLE);
    Haptics.selectionAsync();
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  const lineCount = inputText ? inputText.split(/[\n\r]+/).filter((l) => l.trim()).length : 0;
  const validCount = inputText
    ? inputText
        .split(/[\n\r,;]+/)
        .map((l) => (l.split("|")[0] ?? "").trim())
        .filter((l) => /^\d+$/.test(l)).length
    : 0;

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

      <Animated.ScrollView
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 16, paddingBottom: btmPad + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header */}
        <View style={styles.hero}>
          <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="dynamic-feed" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.appTitle, { color: colors.foreground }]}>
              FB UID Manager
            </Text>
            <Text style={[styles.appSubtitle, { color: colors.mutedForeground }]}>
              Bulk Facebook UID validation & management
            </Text>
          </View>
          {entries.length > 0 && (
            <TouchableOpacity
              onPress={handleViewList}
              style={[styles.heroBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.heroBadgeNum, { color: colors.primary }]}>{entries.length}</Text>
              <Text style={[styles.heroBadgeLabel, { color: colors.primary }]}>Saved</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Input Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <MaterialIcons name="edit-note" size={20} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Paste UIDs</Text>
            </View>
            {lineCount > 0 ? (
              <View style={styles.cardHeaderRight}>
                <View style={[styles.countPill, { backgroundColor: colors.primary + "22" }]}>
                  <MaterialIcons name="check-circle-outline" size={11} color={colors.primary} />
                  <Text style={[styles.countText, { color: colors.primary }]}>
                    {validCount}/{lineCount}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClearInput}
                  style={[styles.iconBtn, { backgroundColor: colors.destructive + "22" }]}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="clear" size={14} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handlePasteSample}
                style={[styles.sampleBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.sampleBtnText, { color: colors.mutedForeground }]}>Sample</Text>
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: lineCount > 0 ? colors.primary + "55" : colors.border,
              },
            ]}
            multiline
            placeholder={`One UID per line:\n${EXAMPLE}`}
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={setInputText}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            testID="uid-input"
          />

          <View style={styles.formatHint}>
            <MaterialIcons name="info-outline" size={13} color={colors.mutedForeground} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Format: <Text style={{ color: colors.primary, fontWeight: "600" }}>UID</Text> or{" "}
              <Text style={{ color: colors.primary, fontWeight: "600" }}>UID|password</Text>
              {"  "}·  Duplicates auto-removed
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.importBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={handleImportFile}
            activeOpacity={0.8}
            testID="import-btn"
          >
            <MaterialIcons name="folder-open" size={20} color={colors.primary} />
            <Text style={[styles.importBtnText, { color: colors.foreground }]}>Import File</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.processBtn,
            {
              backgroundColor: validCount > 0 ? colors.primary : colors.border,
              shadowColor: validCount > 0 ? colors.primary : "transparent",
            },
          ]}
          onPress={handleProcess}
          activeOpacity={0.85}
          disabled={validCount === 0}
          testID="process-btn"
        >
          <MaterialIcons
            name="rocket-launch"
            size={22}
            color={validCount > 0 ? "#fff" : colors.mutedForeground}
          />
          <Text
            style={[
              styles.processBtnText,
              { color: validCount > 0 ? "#fff" : colors.mutedForeground },
            ]}
          >
            {validCount > 0 ? `Process ${validCount} UIDs` : "Process UIDs"}
          </Text>
        </TouchableOpacity>

        {entries.length > 0 && (
          <TouchableOpacity
            style={[styles.viewListBtn, { borderColor: colors.info + "55", backgroundColor: colors.info + "11" }]}
            onPress={handleViewList}
            activeOpacity={0.8}
            testID="view-list-btn"
          >
            <MaterialIcons name="visibility" size={18} color={colors.info} />
            <Text style={[styles.viewListText, { color: colors.info }]}>
              Open Saved List ({entries.length})
            </Text>
            <MaterialIcons name="arrow-forward" size={16} color={colors.info} />
          </TouchableOpacity>
        )}

        {/* Feature Highlights */}
        <View style={styles.featureGrid}>
          <View style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="speed" size={18} color="#22C55E" />
            <Text style={[styles.featureText, { color: colors.foreground }]}>Fast Bulk Check</Text>
          </View>
          <View style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="auto-awesome" size={18} color="#F59E0B" />
            <Text style={[styles.featureText, { color: colors.foreground }]}>Auto Profile Fetch</Text>
          </View>
          <View style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="content-copy" size={18} color="#60A5FA" />
            <Text style={[styles.featureText, { color: colors.foreground }]}>One-Tap Copy</Text>
          </View>
          <View style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="cloud-off" size={18} color="#A78BFA" />
            <Text style={[styles.featureText, { color: colors.foreground }]}>Works Offline</Text>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1877F2",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  appTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  appSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  heroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  heroBadgeNum: { fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 20 },
  heroBadgeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 1 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  sampleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  sampleBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  input: {
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  formatHint: { flexDirection: "row", alignItems: "center", gap: 6 },
  hintText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 },
  actionRow: { gap: 10 },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  importBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  processBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 17,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  processBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  viewListBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  viewListText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minWidth: "47%",
  },
  featureText: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
