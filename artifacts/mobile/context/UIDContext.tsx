import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type LiveStatus =
  | "live"
  | "dead"
  | "unknown"
  | "checking"
  | "pending";

export interface UIDEntry {
  id: string;
  uid: string;
  password?: string;
  name?: string;
  pictureUrl?: string;
  liveStatus: LiveStatus;
  isVisited: boolean;
}

export interface Stats {
  total: number;
  live: number;
  dead: number;
  unknown: number;
  visited: number;
  duplicatesRemoved: number;
}

export interface ProcessingState {
  isProcessing: boolean;
  step: string;
  progress: number;
  stepIndex: number;
}

interface UIDContextType {
  entries: UIDEntry[];
  stats: Stats;
  processing: ProcessingState;
  parseAndProcess: (input: string) => Promise<void>;
  removeEntry: (id: string) => void;
  markVisited: (id: string) => void;
  clearAll: () => void;
}

const UIDContext = createContext<UIDContextType | null>(null);
const STORAGE_KEY = "@uid_manager_v3";

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function computeStats(entries: UIDEntry[], duplicatesRemoved: number): Stats {
  return {
    total: entries.length,
    live: entries.filter((e) => e.liveStatus === "live").length,
    dead: entries.filter((e) => e.liveStatus === "dead").length,
    unknown: entries.filter((e) =>
      ["unknown", "pending", "checking"].includes(e.liveStatus)
    ).length,
    visited: entries.filter((e) => e.isVisited).length,
    duplicatesRemoved,
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchNameFromMobilePage(uid: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://m.facebook.com/profile.php?id=${uid}&_fb_noscript=1`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      }
    );
    clearTimeout(timer);

    if (!response.ok) return undefined;

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
    if (titleMatch) {
      const raw = decodeHtmlEntities(titleMatch[1]);
      const name = raw
        .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
        .replace(/\s*\|\s*.*$/, "")
        .trim();
      if (
        name.length >= 2 &&
        !name.toLowerCase().includes("facebook") &&
        !name.toLowerCase().includes("log in") &&
        !name.toLowerCase().includes("sign in") &&
        !name.toLowerCase().includes("error")
      ) {
        return name;
      }
    }

    const ogMatches = [
      html.match(/property="og:title"\s+content="([^"]{2,120})"/i),
      html.match(/content="([^"]{2,120})"\s+property="og:title"/i),
      html.match(/"og:title","content":"([^"]{2,120})"/i),
    ];
    for (const m of ogMatches) {
      if (m) {
        const name = decodeHtmlEntities(m[1]).trim();
        if (
          name.length >= 2 &&
          !name.toLowerCase().includes("facebook") &&
          !name.toLowerCase().includes("log")
        ) {
          return name;
        }
      }
    }

    const h1Match = html.match(/<h1[^>]*>\s*<[^>]+>\s*([^<]{2,80})\s*</i);
    if (h1Match) {
      const name = decodeHtmlEntities(h1Match[1]).trim();
      if (name.length >= 2 && !name.toLowerCase().includes("facebook")) {
        return name;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function checkFacebookProfile(uid: string): Promise<{
  status: "live" | "dead" | "unknown";
  name?: string;
  pictureUrl: string;
}> {
  const pictureUrl = `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(
      `https://graph.facebook.com/${uid}?fields=name,id,picture.type(normal)`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }
    );
    clearTimeout(timer);

    const data = (await response.json()) as {
      id?: string;
      name?: string;
      picture?: { data?: { url?: string } };
      error?: { code: number; message: string };
    };

    if (data?.id) {
      const picFromApi = data.picture?.data?.url ?? pictureUrl;
      return { status: "live", name: data.name, pictureUrl: picFromApi };
    }

    if (data?.error) {
      const code = data.error.code;
      const msg = (data.error.message ?? "").toLowerCase();

      if (code === 803 || msg.includes("not exist") || msg.includes("not found")) {
        return { status: "dead", pictureUrl };
      }

      if ([2500, 190, 102, 104, 200, 10, 1].includes(code)) {
        const name = await fetchNameFromMobilePage(uid);
        return { status: "live", name, pictureUrl };
      }
    }

    const name = await fetchNameFromMobilePage(uid);
    return { status: "unknown", name, pictureUrl };
  } catch {
    const name = await fetchNameFromMobilePage(uid);
    return { status: "unknown", name, pictureUrl };
  }
}

export function UIDProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<UIDEntry[]>([]);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    step: "",
    progress: 0,
    stepIndex: 0,
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as {
            entries: UIDEntry[];
            duplicatesRemoved: number;
          };
          setEntries(parsed.entries ?? []);
          setDuplicatesRemoved(parsed.duplicatesRemoved ?? 0);
        } catch {}
      }
    });
  }, []);

  const save = useCallback((newEntries: UIDEntry[], dups: number) => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries: newEntries, duplicatesRemoved: dups })
    );
  }, []);

  const parseAndProcess = useCallback(
    async (input: string) => {
      setProcessing({ isProcessing: true, step: "Parsing input...", progress: 5, stepIndex: 0 });
      await new Promise((r) => setTimeout(r, 600));

      const lines = input
        .split(/[\n\r,;]+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const parsed: Array<{ uid: string; password?: string }> = [];
      for (const line of lines) {
        const parts = line.split("|");
        const uid = (parts[0] ?? "").trim();
        const pw = parts[1]?.trim();
        if (uid) parsed.push({ uid, password: pw || undefined });
      }

      setProcessing({ isProcessing: true, step: "Removing duplicates...", progress: 20, stepIndex: 1 });
      await new Promise((r) => setTimeout(r, 400));

      const seen = new Set<string>();
      const unique: Array<{ uid: string; password?: string }> = [];
      for (const item of parsed) {
        if (!seen.has(item.uid)) {
          seen.add(item.uid);
          unique.push(item);
        }
      }
      const removedCount = parsed.length - unique.length;

      setProcessing({ isProcessing: true, step: "Validating UIDs...", progress: 40, stepIndex: 2 });
      await new Promise((r) => setTimeout(r, 400));

      const validated = unique.filter((item) => /^\d+$/.test(item.uid));

      const newEntries: UIDEntry[] = validated.map((item) => ({
        id: makeId(),
        uid: item.uid,
        password: item.password,
        name: undefined,
        pictureUrl: undefined,
        liveStatus: "pending" as LiveStatus,
        isVisited: false,
      }));

      setDuplicatesRemoved(removedCount);
      setEntries(newEntries);

      setProcessing({
        isProcessing: true,
        step: `Fetching profiles (0/${newEntries.length})...`,
        progress: 50,
        stepIndex: 3,
      });

      const updated = [...newEntries];

      for (let i = 0; i < updated.length; i++) {
        const entry = updated[i];

        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, liveStatus: "checking" } : e))
        );

        const info = await checkFacebookProfile(entry.uid);
        updated[i] = {
          ...entry,
          liveStatus: info.status,
          name: info.name,
          pictureUrl: info.pictureUrl,
        };

        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  liveStatus: info.status,
                  name: info.name,
                  pictureUrl: info.pictureUrl,
                }
              : e
          )
        );

        const progress = 50 + Math.round(((i + 1) / updated.length) * 48);
        setProcessing({
          isProcessing: true,
          step: `Profile ${i + 1}/${updated.length}${info.name ? ` — ${info.name}` : ""}`,
          progress,
          stepIndex: 3,
        });

        await new Promise((r) => setTimeout(r, 150));
      }

      save(updated, removedCount);
      setProcessing({ isProcessing: false, step: "Done", progress: 100, stepIndex: 3 });
    },
    [save]
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const updated = prev.filter((e) => e.id !== id);
        save(updated, duplicatesRemoved);
        return updated;
      });
    },
    [save, duplicatesRemoved]
  );

  const markVisited = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const updated = prev.map((e) => (e.id === id ? { ...e, isVisited: true } : e));
        save(updated, duplicatesRemoved);
        return updated;
      });
    },
    [save, duplicatesRemoved]
  );

  const clearAll = useCallback(() => {
    setEntries([]);
    setDuplicatesRemoved(0);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const stats = computeStats(entries, duplicatesRemoved);

  return (
    <UIDContext.Provider
      value={{ entries, stats, processing, parseAndProcess, removeEntry, markVisited, clearAll }}
    >
      {children}
    </UIDContext.Provider>
  );
}

export function useUID() {
  const ctx = useContext(UIDContext);
  if (!ctx) throw new Error("useUID must be used inside UIDProvider");
  return ctx;
}
