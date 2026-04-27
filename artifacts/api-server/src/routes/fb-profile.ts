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

function extractNameFromHtml(html: string): string | undefined {
  const patterns = [
    /<title[^>]*>([^<]{2,120})<\/title>/i,
  ];

  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) {
      const raw = decodeHtml(m[1]);
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
  }

  const ogPatterns = [
    /property="og:title"\s+content="([^"]{2,120})"/i,
    /content="([^"]{2,120})"\s+property="og:title"/i,
    /"og:title","content":"([^"]{2,120})"/i,
    /\\"og_title\\":\\"([^"]{2,120})\\"/i,
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

  const jsonPatterns = [
    /"name":"([^"]{2,80})"/,
    /"full_name":"([^"]{2,80})"/,
    /"displayname":"([^"]{2,80})"/i,
  ];
  for (const p of jsonPatterns) {
    const m = html.match(p);
    if (m) {
      const name = decodeHtml(m[1]).trim();
      if (
        name.length >= 2 &&
        !name.toLowerCase().includes("facebook")
      ) {
        return name;
      }
    }
  }

  return undefined;
}

async function tryFetchName(uid: string): Promise<string | undefined> {
  const endpoints = [
    {
      url: `https://m.facebook.com/profile.php?id=${uid}`,
      ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    },
    {
      url: `https://graph.facebook.com/${uid}?fields=name,id`,
      ua: "facebookexternalhit/1.1",
      isJson: true,
    },
    {
      url: `https://m.facebook.com/profile.php?id=${uid}`,
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
    {
      url: `https://www.facebook.com/profile.php?id=${uid}`,
      ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(endpoint.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": endpoint.ua,
          Accept: (endpoint as any).isJson
            ? "application/json"
            : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        redirect: "follow",
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      if ((endpoint as any).isJson) {
        const data = await res.json() as { id?: string; name?: string; error?: { code: number } };
        if (data.name) return data.name;
        continue;
      }

      const html = await res.text();
      const name = extractNameFromHtml(html);
      if (name) return name;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function checkLiveStatus(uid: string): Promise<{
  status: "live" | "dead" | "unknown";
  name?: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(
      `https://graph.facebook.com/${uid}?fields=name,id`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }
    );
    clearTimeout(timer);

    const data = await res.json() as {
      id?: string;
      name?: string;
      error?: { code: number; message: string };
    };

    if (data.id) {
      return { status: "live", name: data.name };
    }

    if (data.error) {
      const code = data.error.code;
      const msg = (data.error.message ?? "").toLowerCase();

      if (code === 803 || msg.includes("not exist") || msg.includes("not found")) {
        return { status: "dead" };
      }

      if ([2500, 190, 102, 104, 200, 10, 1].includes(code)) {
        const name = await tryFetchName(uid);
        return { status: "live", name };
      }
    }

    const name = await tryFetchName(uid);
    return { status: "unknown", name };
  } catch {
    const name = await tryFetchName(uid);
    return { status: "unknown", name };
  }
}

router.get("/fb-profile", async (req, res) => {
  const uid = req.query["uid"] as string | undefined;

  if (!uid || !/^\d+$/.test(uid)) {
    res.status(400).json({ error: "Invalid UID" });
    return;
  }

  try {
    const result = await checkLiveStatus(uid);
    const pictureUrl = `https://graph.facebook.com/${uid}/picture?type=normal&width=100&height=100`;

    let name = result.name;
    if (name) {
      const isSysCamelCase = /^[A-Z][a-zA-Z]{20,}$/.test(name) && !name.includes(" ");
      const isSysSnake = /^[a-z_]{10,}$/.test(name);
      if (isSysCamelCase || isSysSnake) name = undefined;
    }

    res.json({ ...result, name, pictureUrl, uid });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
