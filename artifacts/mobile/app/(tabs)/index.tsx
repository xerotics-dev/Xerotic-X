import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  ScrollView,
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

const EXAMPLE = `123456789
987654321|mypassword
555666777
111222333|pass123`;

export default function InputScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { parseAndProcess, processing, entries } = useUID();

  const [inputText, setInputText] = useState("");
  const [hasProcessed, setHasProcessed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
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
      Alert.alert("Empty Input", "Please paste UIDs or import a .txt file.");
      return;
    }

    if (entries.length > 0) {
      Alert.alert(
        "Existing List Found",
        `You already have ${entries.length} UIDs. What do you want to do?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Add to List",
            onPress: () => startProcess("append"),
          },
          {
            text: "Replace All",
            style: "destructive",
            onPress: () => startProcess("replace"),
          },
        ]
      );
    } else {
      await startProcess("replace");
    }
  };

  const handleImportTxt = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === "ios" ? "public.plain-text" : "text/plain",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;

      let content = "";
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        content = await response.text();
      } else {
        content = await FileSystem.readAsStringAsync(uri);
      }

      setInputText((prev) => (prev ? prev + "\n" + content : content));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Import Error", "Could not read the selected file.");
    }
  };

  const handleViewList = () => {
    router.push("/list");
  };

  const handleClearInput = () => {
    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  const lineCount = inputText ? inputText.split("\n").filter((l) => l.trim()).length : 0;

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
        style={{ opacity: fadeAnim }}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: topPad + 16,
            paddingBottom: btmPad + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="list-alt" size={26} color="#fff" />
          </View>
          <View>
            <Text style={[styles.appTitle, { color: colors.foreground }]}>
              FB UID Manager
            </Text>
            <Text style={[styles.appSubtitle, { color: colors.mutedForeground }]}>
              Facebook UID List Management
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="input" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              UID Input
            </Text>
            {lineCount > 0 ? (
              <View style={styles.cardHeaderRight}>
                <View style={[styles.countPill, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={[styles.countText, { color: colors.primary }]}>
                    {lineCount} lines
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClearInput}
                  style={[styles.clearInputBtn, { backgroundColor: colors.destructive + "22" }]}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="clear" size={14} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            multiline
            placeholder={`Paste UIDs here...\n\nFormat:\n${EXAMPLE}`}
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
            <MaterialIcons name="info-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              One UID per line. Format: <Text style={{ color: colors.primary }}>UID</Text> or{" "}
              <Text style={{ color: colors.primary }}>UID|Password</Text>
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.importBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={handleImportTxt}
          activeOpacity={0.8}
          testID="import-btn"
        >
          <MaterialIcons name="upload-file" size={20} color={colors.primary} />
          <Text style={[styles.importBtnText, { color: colors.foreground }]}>
            Import .txt File
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.processBtn,
            { backgroundColor: inputText.trim() ? colors.primary : colors.border },
          ]}
          onPress={handleProcess}
          activeOpacity={0.85}
          disabled={!inputText.trim()}
          testID="process-btn"
        >
          <MaterialIcons
            name="play-circle-filled"
            size={22}
            color={inputText.trim() ? "#fff" : colors.mutedForeground}
          />
          <Text
            style={[
              styles.processBtnText,
              { color: inputText.trim() ? "#fff" : colors.mutedForeground },
            ]}
          >
            Process UIDs
          </Text>
        </TouchableOpacity>

        {entries.length > 0 && (
          <TouchableOpacity
            style={[styles.viewListBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={handleViewList}
            activeOpacity={0.8}
            testID="view-list-btn"
          >
            <MaterialIcons name="format-list-bulleted" size={18} color={colors.info} />
            <Text style={[styles.viewListText, { color: colors.info }]}>
              View List ({entries.length} UIDs)
            </Text>
            <MaterialIcons name="arrow-forward-ios" size={14} color={colors.info} />
          </TouchableOpacity>
        )}

        <View style={[styles.tipCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialIcons name="lightbulb-outline" size={16} color={colors.warning} />
          <Text style={[styles.tipText, { color: colors.mutedForeground }]}>
            Tip: UIDs must be numeric. Duplicates are auto-removed. Tap a UID in the list to open its Facebook profile.
          </Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  appTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  appSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  clearInputBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  formatHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  importBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  processBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
  },
  processBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  viewListBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  viewListText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
    textAlign: "center",
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  tipText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
});
