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
  username?: string;
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
  parseAndProcess: (input: string, mode?: "replace" | "append") => Promise<void>;
  removeEntry: (id: string) => void;
  markVisited: (id: string) => void;
  clearAll: () => void;
}

const UIDContext = createContext<UIDContextType | null>(null);
const STORAGE_KEY = "@uid_manager_v5";

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

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractNameFromHtml(html: string): string | undefined {
  if (
    html.includes('href="https://www.facebook.com/login"') ||
    html.includes("/login?next=")
  ) return undefined;

  const patterns = [
    new RegExp(`property="og:title"\\s+content="([^"]{2,100})"`, "i"),
    new RegExp(`content="([^"]{2,100})"\\s+property="og:title"`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const name = decodeHtml(m[1])
        .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
        .trim();
      if (name.length >= 2 && !name.toLowerCase().includes("facebook") && !name.toLowerCase().includes("log in"))
        return name;
    }
  }
  const titleMatch = html.match(/<title[^>]*>([^<]{2,100})<\/title>/i);
  if (titleMatch) {
    const name = decodeHtml(titleMatch[1])
      .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
      .trim();
    if (name.length >= 2 && !name.toLowerCase().includes("facebook"))
      return name;
  }
  return undefined;
}

function extractUsernameFromHtml(html: string): string | undefined {
  const p = /property="og:url"\s+content="[^"]*facebook\.com\/([^/?#"]+)"/i;
  const m = html.match(p);
  if (m?.[1] && m[1] !== "profile.php" && m[1] !== "people") return m[1];
  return undefined;
}

async function fetchProfileFromServer(uid: string): Promise<{
  status: "live" | "dead" | "unknown";
  name?: string;
  username?: string;
  pictureUrl?: string;
}> {
  const pictureUrl = `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

  try {
    // 1. Live status check via Graph API (no token needed)
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 8000);
    const graphRes = await fetch(`https://graph.facebook.com/${uid}`, {
      signal: ctrl1.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t1);

    let status: "live" | "dead" | "unknown" = "unknown";
    if (graphRes.ok) {
      const data = (await graphRes.json()) as {
        id?: string;
        error?: { code: number; error_subcode?: number; message: string };
      };
      if (data.id) {
        status = "live";
      } else if (data.error) {
        const code = data.error.code;
        const msg = (data.error.message ?? "").toLowerCase();
        if (code === 803 || (msg.includes("does not exist") && !msg.includes("permissions"))) {
          status = "dead";
        } else if ([104, 190, 2500, 102, 200, 10, 1].includes(code)) {
          status = "live";
        } else if (code === 100 && (data.error.error_subcode ?? 0) === 33) {
          status = "live";
        }
      }
    }

    // 2. Fetch name/username from mbasic Facebook (React Native has no CORS!)
    let name: string | undefined;
    let username: string | undefined;
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 6000);
      const pageRes = await fetch(`https://mbasic.facebook.com/profile.php?id=${uid}`, {
        signal: ctrl2.signal,
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          Accept: "text/html",
        },
      });
      clearTimeout(t2);
      if (pageRes.ok) {
        const html = await pageRes.text();
        name = extractNameFromHtml(html);
        username = extractUsernameFromHtml(html);
      }
    } catch { /* silent fail, picture still works */ }

    return { status, name, username, pictureUrl };
  } catch {
    return { status: "unknown", pictureUrl };
  }
}

async function processBatch(
  newEntries: UIDEntry[],
  onBatchDone: (updates: Record<string, Awaited<ReturnType<typeof fetchProfileFromServer>>>, completed: number, total: number) => void
): Promise<UIDEntry[]> {
  const updated = [...newEntries];
  const BATCH = 20;
  let completed = 0;

  for (let batchStart = 0; batchStart < updated.length; batchStart += BATCH) {
    const slice = updated.slice(batchStart, batchStart + BATCH);

    const results = await Promise.all(
      slice.map((entry) => fetchProfileFromServer(entry.uid))
    );

    const updates: Record<string, typeof results[0]> = {};
    results.forEach((info, i) => {
      const entry = slice[i]!;
      const idx = batchStart + i;
      updated[idx] = {
        ...entry,
        liveStatus: info.status,
        name: info.name,
        username: info.username,
        pictureUrl: info.pictureUrl,
      };
      updates[entry.id] = info;
    });

    completed += slice.length;
    onBatchDone(updates, completed, updated.length);
  }

  return updated;
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
    async (input: string, mode: "replace" | "append" = "replace") => {
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
        username: undefined,
        pictureUrl: undefined,
        liveStatus: "pending" as LiveStatus,
        isVisited: false,
      }));

      let existingEntries: UIDEntry[] = [];

      if (mode === "append") {
        setEntries((prev) => {
          existingEntries = prev;
          const existingUids = new Set(prev.map((e) => e.uid));
          const genuinelyNew = newEntries.filter((e) => !existingUids.has(e.uid));
          return [...prev, ...genuinelyNew];
        });
        await new Promise((r) => setTimeout(r, 50));
      } else {
        setEntries(newEntries);
        existingEntries = [];
      }

      setDuplicatesRemoved(duplicatesRemoved + removedCount);

      setProcessing({
        isProcessing: true,
        step: `Fetching 0/${newEntries.length}...`,
        progress: 50,
        stepIndex: 3,
      });

      const onBatchDone = (
        updates: Record<string, { status: "live" | "dead" | "unknown"; name?: string; username?: string; pictureUrl?: string }>,
        completed: number,
        total: number
      ) => {
        const lastName = Object.values(updates).map((r) => r.name).filter(Boolean).pop();
        const progress = 50 + Math.round((completed / total) * 48);
        setProcessing({
          isProcessing: true,
          step: `Fetched ${completed}/${total}${lastName ? ` — ${lastName}` : ""}`,
          progress,
          stepIndex: 3,
        });
        setEntries((prev) =>
          prev.map((e) => {
            const info = updates[e.id];
            if (!info) return e;
            return {
              ...e,
              liveStatus: info.status,
              name: info.name,
              username: info.username,
              pictureUrl: info.pictureUrl,
            };
          })
        );
      };

      const updatedNew = await processBatch(newEntries, onBatchDone);

      const finalEntries = mode === "append"
        ? [...existingEntries, ...updatedNew.filter((e) => !existingEntries.some((ex) => ex.uid === e.uid))]
        : updatedNew;

      save(finalEntries, duplicatesRemoved + removedCount);
      setEntries(finalEntries);
      setProcessing({ isProcessing: false, step: "Done", progress: 100, stepIndex: 3 });
    },
    [save, duplicatesRemoved]
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
