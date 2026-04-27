import { Router } from "express";

const router = Router();

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function getMetaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`property="${property}"\\s+content="([^"]{1,500})"`, "i"),
    new RegExp(`content="([^"]{1,500})"\\s+property="${property}"`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decodeHtml(m[1]).trim();
  }
  return undefined;
}

function isSystemName(name: string): boolean {
  return (
    (!name.includes(" ") && /^[A-Z][a-zA-Z]{20,}$/.test(name)) ||
    /^[a-z_]{12,}$/.test(name)
  );
}

function extractDataFromHtml(html: string): {
  name?: string;
  username?: string;
  pictureUrl?: string;
} {
  // Check if redirected to login
  if (
    html.includes('href="https://www.facebook.com/login"') ||
    html.includes("/login?next=") ||
    html.includes('"loginRedirect"')
  ) {
    return {};
  }

  // Name from og:title
  let name: string | undefined;
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) {
    const cleaned = ogTitle
      .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
      .replace(/\s*\|\s*.*$/, "")
      .trim();
    if (
      cleaned.length >= 2 &&
      !cleaned.toLowerCase().includes("facebook") &&
      !cleaned.toLowerCase().includes("log in") &&
      !cleaned.toLowerCase().includes("sign") &&
      !cleaned.toLowerCase().includes("error") &&
      !isSystemName(cleaned)
    ) {
      name = cleaned;
    }
  }

  // Fallback: <title> tag
  if (!name) {
    const titleMatch = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
    if (titleMatch) {
      const raw = decodeHtml(titleMatch[1])
        .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
        .replace(/\s*\|\s*.*$/, "")
        .trim();
      if (
        raw.length >= 2 &&
        !raw.toLowerCase().includes("facebook") &&
        !raw.toLowerCase().includes("log") &&
        !isSystemName(raw)
      ) {
        name = raw;
      }
    }
  }

  // Profile picture from og:image
  const ogImage = getMetaContent(html, "og:image");
  const pictureUrl = ogImage && !ogImage.includes("static") ? ogImage : undefined;

  // Username from og:url
  let username: string | undefined;
  const ogUrl = getMetaContent(html, "og:url");
  if (ogUrl) {
    const m = ogUrl.match(/facebook\.com\/([^/?#]+)/i);
    if (m?.[1] && m[1] !== "profile.php" && m[1] !== "people") {
      username = m[1];
    }
  }

  return { name, username, pictureUrl };
}

const USER_AGENTS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Twitterbot/1.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0",
];

async function fetchProfileFromPage(uid: string): Promise<{
  name?: string;
  username?: string;
  pictureUrl?: string;
}> {
  const urls = [
    `https://www.facebook.com/profile.php?id=${uid}`,
    `https://m.facebook.com/profile.php?id=${uid}`,
    `https://mbasic.facebook.com/profile.php?id=${uid}`,
  ];

  for (const ua of USER_AGENTS) {
    for (const url of urls) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
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
        if (!res.ok) continue;
        const html = await res.text();
        const result = extractDataFromHtml(html);
        if (result.name) return result;
      } catch {
        continue;
      }
    }
  }
  return {};
}

async function checkLiveStatus(uid: string): Promise<"live" | "dead" | "unknown"> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`https://graph.facebook.com/${uid}?fields=name,id`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);

    const data = (await res.json()) as {
      id?: string;
      error?: { code: number; error_subcode?: number; message: string };
    };

    if (data.id) return "live";

    if (data.error) {
      const code = data.error.code;
      const sub = data.error.error_subcode ?? 0;
      const msg = (data.error.message ?? "").toLowerCase();
      if (code === 803) return "dead";
      if (msg.includes("does not exist") && !msg.includes("permissions")) return "dead";
      if ([104, 190, 2500, 102, 200, 10, 1].includes(code)) return "live";
      if (code === 100 && sub === 33) return "live";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

router.get("/fb-profile", async (req, res) => {
  const uid = req.query["uid"] as string | undefined;

  if (!uid || !/^\d+$/.test(uid)) {
    res.status(400).json({ error: "Invalid UID" });
    return;
  }

  try {
    // Always provide a reliable picture URL via graph API (public redirect)
    const fallbackPic = `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

    const [liveStatus, profile] = await Promise.all([
      checkLiveStatus(uid),
      fetchProfileFromPage(uid),
    ]);

    res.json({
      uid,
      status: liveStatus,
      name: profile.name,
      username: profile.username,
      pictureUrl: profile.pictureUrl ?? fallbackPic,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
