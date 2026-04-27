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
  refreshEntry: (id: string) => Promise<void>;
  refreshUnknown: () => Promise<void>;
  exportAsText: (includePasswords?: boolean) => string;
  removeVisited: () => void;
  removeDead: () => void;
  resetVisited: () => void;
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

function isLoginWall(html: string): boolean {
  return (
    html.includes('href="https://www.facebook.com/login"') ||
    html.includes("/login.php?") ||
    html.includes("/login?next=") ||
    html.includes('"loginRedirect"') ||
    html.includes("checkpoint/block")
  );
}

function isSystemName(name: string): boolean {
  return (
    /^(facebook|log in|sign up|error|page not found)/i.test(name) ||
    (!name.includes(" ") && /^[A-Z][a-zA-Z]{20,}$/.test(name)) ||
    /^[a-z_]{12,}$/.test(name)
  );
}

function cleanName(raw: string): string | undefined {
  const cleaned = decodeHtml(raw)
    .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 80) return undefined;
  if (isSystemName(cleaned)) return undefined;
  return cleaned;
}

function extractNameFromHtml(html: string): string | undefined {
  if (isLoginWall(html)) return undefined;

  const ogPatterns = [
    /property="og:title"\s+content="([^"]{2,100})"/i,
    /content="([^"]{2,100})"\s+property="og:title"/i,
    /<meta\s+property="og:title"\s+content="([^"]{2,100})"/i,
  ];
  for (const p of ogPatterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const name = cleanName(m[1]);
      if (name) return name;
    }
  }

  const titleMatch = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
  if (titleMatch) {
    const name = cleanName(titleMatch[1]);
    if (name) return name;
  }

  const h1Match = html.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i);
  if (h1Match) {
    const name = cleanName(h1Match[1]);
    if (name) return name;
  }

  const titleSpan = html.match(/<strong[^>]*>([^<]{2,80})<\/strong>/i);
  if (titleSpan) {
    const name = cleanName(titleSpan[1]);
    if (name) return name;
  }

  return undefined;
}

function extractUsernameFromHtml(html: string): string | undefined {
  const ogUrl = html.match(/property="og:url"\s+content="[^"]*facebook\.com\/([^/?#"]+)"/i);
  if (ogUrl?.[1] && ogUrl[1] !== "profile.php" && ogUrl[1] !== "people" && !/^\d+$/.test(ogUrl[1])) {
    return ogUrl[1];
  }
  const canonical = html.match(/<link\s+rel="canonical"\s+href="[^"]*facebook\.com\/([^/?#"]+)"/i);
  if (canonical?.[1] && canonical[1] !== "profile.php" && !/^\d+$/.test(canonical[1])) {
    return canonical[1];
  }
  return undefined;
}

const FETCH_ATTEMPTS = [
  {
    url: (uid: string) => `https://www.facebook.com/profile.php?id=${uid}`,
    ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  },
  {
    url: (uid: string) => `https://mbasic.facebook.com/profile.php?id=${uid}`,
    ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  },
  {
    url: (uid: string) => `https://m.facebook.com/profile.php?id=${uid}`,
    ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  },
  {
    url: (uid: string) => `https://www.facebook.com/${uid}`,
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
  {
    url: (uid: string) => `https://mbasic.facebook.com/${uid}`,
    ua: "Twitterbot/1.0",
  },
];

async function tryFetchHtml(url: string, ua: string, timeoutMs: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchProfileData(uid: string): Promise<{ name?: string; username?: string }> {
  for (const attempt of FETCH_ATTEMPTS) {
    const html = await tryFetchHtml(attempt.url(uid), attempt.ua, 6000);
    if (!html) continue;
    const name = extractNameFromHtml(html);
    const username = extractUsernameFromHtml(html);
    if (name) return { name, username };
  }
  return {};
}

async function fetchProfileFromServer(uid: string): Promise<{
  status: "live" | "dead" | "unknown";
  name?: string;
  username?: string;
  pictureUrl?: string;
}> {
  const pictureUrl = `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

  // Run live check + profile data in parallel
  const liveCheck = (async (): Promise<"live" | "dead" | "unknown"> => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://graph.facebook.com/${uid}`, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(t);
      if (!res.ok) return "unknown";
      const data = (await res.json()) as {
        id?: string;
        error?: { code: number; error_subcode?: number; message: string };
      };
      if (data.id) return "live";
      if (data.error) {
        const code = data.error.code;
        const msg = (data.error.message ?? "").toLowerCase();
        if (code === 803 || (msg.includes("does not exist") && !msg.includes("permissions"))) return "dead";
        if ([104, 190, 2500, 102, 200, 10, 1].includes(code)) return "live";
        if (code === 100 && (data.error.error_subcode ?? 0) === 33) return "live";
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  })();

  const [status, profile] = await Promise.all([liveCheck, fetchProfileData(uid)]);
  return { status, name: profile.name, username: profile.username, pictureUrl };
}

async function processBatch(
  newEntries: UIDEntry[],
  onBatchDone: (updates: Record<string, Awaited<ReturnType<typeof fetchProfileFromServer>>>, completed: number, total: number) => void
): Promise<UIDEntry[]> {
  const updated = [...newEntries];
  const BATCH = 6;
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

    // Small delay between batches to avoid Facebook rate limiting
    if (batchStart + BATCH < updated.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
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

  const refreshEntry = useCallback(
    async (id: string) => {
      const target = entries.find((e) => e.id === id);
      if (!target) return;
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, liveStatus: "checking" } : e))
      );
      const info = await fetchProfileFromServer(target.uid);
      setEntries((prev) => {
        const updated = prev.map((e) =>
          e.id === id
            ? {
                ...e,
                liveStatus: info.status,
                name: info.name ?? e.name,
                username: info.username ?? e.username,
                pictureUrl: info.pictureUrl ?? e.pictureUrl,
              }
            : e
        );
        save(updated, duplicatesRemoved);
        return updated;
      });
    },
    [entries, save, duplicatesRemoved]
  );

  const refreshUnknown = useCallback(async () => {
    const targets = entries.filter(
      (e) => e.liveStatus === "unknown" || !e.name
    );
    if (targets.length === 0) return;

    setProcessing({
      isProcessing: true,
      step: `Refreshing 0/${targets.length}...`,
      progress: 0,
      stepIndex: 0,
    });

    setEntries((prev) =>
      prev.map((e) =>
        targets.find((t) => t.id === e.id) ? { ...e, liveStatus: "checking" } : e
      )
    );

    const onBatchDone = (
      updates: Record<string, { status: "live" | "dead" | "unknown"; name?: string; username?: string; pictureUrl?: string }>,
      completed: number,
      total: number
    ) => {
      const lastName = Object.values(updates).map((r) => r.name).filter(Boolean).pop();
      setProcessing({
        isProcessing: true,
        step: `Refreshed ${completed}/${total}${lastName ? ` — ${lastName}` : ""}`,
        progress: Math.round((completed / total) * 100),
        stepIndex: 0,
      });
      setEntries((prev) =>
        prev.map((e) => {
          const info = updates[e.id];
          if (!info) return e;
          return {
            ...e,
            liveStatus: info.status,
            name: info.name ?? e.name,
            username: info.username ?? e.username,
            pictureUrl: info.pictureUrl ?? e.pictureUrl,
          };
        })
      );
    };

    const updated = await processBatch(targets, onBatchDone);
    setEntries((prev) => {
      const next = prev.map((e) => {
        const u = updated.find((x) => x.id === e.id);
        return u ?? e;
      });
      save(next, duplicatesRemoved);
      return next;
    });

    setProcessing({ isProcessing: false, step: "Done", progress: 100, stepIndex: 0 });
  }, [entries, save, duplicatesRemoved]);

  const exportAsText = useCallback(
    (includePasswords = true) => {
      return entries
        .map((e) =>
          includePasswords && e.password ? `${e.uid}|${e.password}` : e.uid
        )
        .join("\n");
    },
    [entries]
  );

  const removeVisited = useCallback(() => {
    setEntries((prev) => {
      const updated = prev.filter((e) => !e.isVisited);
      save(updated, duplicatesRemoved);
      return updated;
    });
  }, [save, duplicatesRemoved]);

  const removeDead = useCallback(() => {
    setEntries((prev) => {
      const updated = prev.filter((e) => e.liveStatus !== "dead");
      save(updated, duplicatesRemoved);
      return updated;
    });
  }, [save, duplicatesRemoved]);

  const resetVisited = useCallback(() => {
    setEntries((prev) => {
      const updated = prev.map((e) => ({ ...e, isVisited: false }));
      save(updated, duplicatesRemoved);
      return updated;
    });
  }, [save, duplicatesRemoved]);

  const stats = computeStats(entries, duplicatesRemoved);

  return (
    <UIDContext.Provider
      value={{
        entries,
        stats,
        processing,
        parseAndProcess,
        removeEntry,
        markVisited,
        clearAll,
        refreshEntry,
        refreshUnknown,
        exportAsText,
        removeVisited,
        removeDead,
        resetVisited,
      }}
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
