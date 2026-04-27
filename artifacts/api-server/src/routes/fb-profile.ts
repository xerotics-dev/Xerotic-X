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

function isSystemName(name: string): boolean {
  const noSpace = !name.includes(" ");
  return (
    (noSpace && /^[A-Z][a-zA-Z]{20,}$/.test(name)) ||
    /^[a-z_]{12,}$/.test(name)
  );
}

function extractNameFromHtml(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
  if (titleMatch) {
    const raw = decodeHtml(titleMatch[1]);
    const name = raw
      .replace(/\s*[|\-–]\s*Facebook.*$/i, "")
      .replace(/\s*\|\s*.*$/, "")
      .trim();
    if (
      name.length >= 2 &&
      !name.toLowerCase().includes("facebook") &&
      !name.toLowerCase().includes("log in") &&
      !name.toLowerCase().includes("sign in") &&
      !name.toLowerCase().includes("sign up") &&
      !name.toLowerCase().includes("error") &&
      !name.toLowerCase().includes("page not found")
    ) {
      return name;
    }
  }

  const ogPatterns = [
    /property="og:title"\s+content="([^"]{2,120})"/i,
    /content="([^"]{2,120})"\s+property="og:title"/i,
    /"og:title","content":"([^"]{2,120})"/i,
  ];
  for (const p of ogPatterns) {
    const m = html.match(p);
    if (m) {
      const name = decodeHtml(m[1]).trim();
      if (
        name.length >= 2 &&
        !name.toLowerCase().includes("facebook") &&
        !name.toLowerCase().includes("log")
      ) {
        return name;
      }
    }
  }

  const jsonNameMatch = html.match(/"name":"([A-Za-z ]{2,80})"/);
  if (jsonNameMatch) {
    const name = decodeHtml(jsonNameMatch[1]).trim();
    if (name.length >= 2 && !isSystemName(name)) return name;
  }

  return undefined;
}

async function fetchNameFromPage(uid: string): Promise<string | undefined> {
  const attempts = [
    {
      url: `https://m.facebook.com/profile.php?id=${uid}`,
      ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    },
    {
      url: `https://www.facebook.com/profile.php?id=${uid}`,
      ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    },
    {
      url: `https://m.facebook.com/profile.php?id=${uid}`,
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  ];

  for (const ep of attempts) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(ep.url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": ep.ua,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const html = await res.text();
      const name = extractNameFromHtml(html);
      if (name && !isSystemName(name)) return name;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Live/dead detection via Graph API error codes (no token needed).
 * Error code meanings:
 *   803 → account deleted / not found
 *   104, 190, 2500, 102, 200, 10, 1 → account exists but needs auth (LIVE)
 *   100/33 → ambiguous — try HTML scrape for confirmation
 */
async function checkLiveStatus(uid: string): Promise<{
  status: "live" | "dead" | "unknown";
}> {
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
      name?: string;
      error?: { code: number; error_subcode?: number; message: string };
    };

    if (data.id) return { status: "live" };

    if (data.error) {
      const code = data.error.code;
      const sub = data.error.error_subcode ?? 0;
      const msg = (data.error.message ?? "").toLowerCase();

      if (code === 803) return { status: "dead" };
      if (msg.includes("does not exist") && !msg.includes("permissions")) return { status: "dead" };
      if ([104, 190, 2500, 102, 200, 10, 1].includes(code)) return { status: "live" };

      // code 100/33: ambiguous — account may exist but be private
      if (code === 100 && sub === 33) return { status: "live" };
    }

    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

router.get("/fb-profile", async (req, res) => {
  const uid = req.query["uid"] as string | undefined;

  if (!uid || !/^\d+$/.test(uid)) {
    res.status(400).json({ error: "Invalid UID" });
    return;
  }

  try {
    const pictureUrl = `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

    const [liveResult, name] = await Promise.all([
      checkLiveStatus(uid),
      fetchNameFromPage(uid),
    ]);

    res.json({
      uid,
      status: liveResult.status,
      name: name ?? undefined,
      pictureUrl,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
