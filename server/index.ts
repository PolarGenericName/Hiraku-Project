import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";

const ANILIST_API = "https://graphql.anilist.co";

// ── Security Constants ──────────────────────────────────────────────────────
const MAX_PROXY_RESPONSE_SIZE = 50 * 1024 * 1024; // 50MB max for proxy responses
const MAX_JSON_RESPONSE_SIZE = 5 * 1024 * 1024;   // 5MB max for JSON responses
const ALLOWED_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "file://",
];

// ── Rate Limiter ────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 200; // max requests per window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

// ── CORS Helper ─────────────────────────────────────────────────────────────
function setCorsHeaders(req: express.Request, res: express.Response) {
  const origin = req.headers.origin || "";
  if (ALLOWED_CORS_ORIGINS.some(o => origin === o || (o === "file://" && origin.startsWith("file://")))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ── Cache ───────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 60_000;

// ── Trailer Query ───────────────────────────────────────────────────────────
const TRAILER_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji english }
      trailer {
        id
        site
        thumbnail
      }
    }
  }
`;

async function fetchAniListTrailer(anilistId: number) {
  const response = await fetch(ANILIST_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Origin": "https://anilist.co",
      "Referer": "https://anilist.co/",
    },
    body: JSON.stringify({ query: TRAILER_QUERY, variables: { id: anilistId } }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const media = data?.data?.Media;

  if (!media?.trailer || media.trailer.site !== "youtube") return null;

  return {
    anilistId: media.id,
    title: media.title?.romaji || media.title?.english,
    youtubeId: media.trailer.id,
    thumbnail: media.trailer.thumbnail || `https://img.youtube.com/vi/${media.trailer.id}/mqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${media.trailer.id}`,
    watchUrl: `https://www.youtube.com/watch?v=${media.trailer.id}`,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const server = createServer(app);

  // ── Rate limiting middleware ─────────────────────────────────────────────
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  });

  // ── CORS preflight ──────────────────────────────────────────────────────
  app.options("*", (req, res) => {
    setCorsHeaders(req, res);
    res.sendStatus(204);
  });

  // ── Static files (production UI) ────────────────────────────────────────
  const staticDir = path.join(__dirname, "public");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  // ── AniList GraphQL proxy ───────────────────────────────────────────────
  app.post("/api/anilist", async (req, res) => {
    const query = req.body?.query || "";
    const variables = req.body?.variables || {};

    // Block introspection queries
    if (query.includes("__schema") || query.includes("__type")) {
      return res.status(403).json({ error: "Introspection not allowed" });
    }

    // Reject excessively large queries or variables
    if (query.length > 10000 || JSON.stringify(variables).length > 5000) {
      return res.status(413).json({ error: "Query too large" });
    }

    const cacheKey = JSON.stringify({ q: query.trim(), v: variables });

    setCorsHeaders(req, res);

    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return res.json(cached.data);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(ANILIST_API, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Origin": "https://anilist.co",
          "Referer": "https://anilist.co/",
        },
        body: JSON.stringify(req.body),
      });

      clearTimeout(timeout);

      const data = await response.json();

      if (response.ok) {
        cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
        if (cache.size > 500) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
      }

      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Trailer endpoint ────────────────────────────────────────────────────
  app.get("/api/trailer/:id", async (req, res) => {
    const anilistId = parseInt(req.params.id, 10);
    if (isNaN(anilistId)) {
      return res.status(400).json({ error: "Invalid AniList ID" });
    }

    setCorsHeaders(req, res);

    try {
      const trailer = await fetchAniListTrailer(anilistId);
      if (!trailer) {
        return res.status(404).json({ error: "No trailer found" });
      }
      res.json(trailer);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── YouTube trailer search ──────────────────────────────────────────────
  app.get("/api/trailer-search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    setCorsHeaders(req, res);

    try {
      const searchQuery = encodeURIComponent(`${query} official trailer`);
      const response = await fetch(`https://www.youtube.com/results?search_query=${searchQuery}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = await response.text();
      const videoIdMatch = html.match(/"videoId":"([^"]+)"/);
      if (!videoIdMatch) {
        return res.status(404).json({ error: "No trailer found" });
      }

      const videoId = videoIdMatch[1];
      res.json({
        videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Stream proxy (akumast.net) ───────────────────────────────────────
  app.use("/stream", async (req, res) => {
    const targetUrl = `https://akumast.net${req.url}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        method: req.method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": "https://animefire.io",
          "Referer": "https://animefire.io/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
      }

      const contentType = response.headers.get("content-type") || "";
      res.setHeader("Content-Type", contentType || "application/octet-stream");

      const reader = response.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: "No response body" });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.length;
        if (totalSize > MAX_PROXY_RESPONSE_SIZE) {
          reader.cancel();
          return res.status(413).json({ error: "Response too large" });
        }
        chunks.push(Buffer.from(value));
      }

      res.send(Buffer.concat(chunks));
    } catch {
      res.status(500).json({ error: "Stream proxy error" });
    }
  });

  // ── Image proxy (akumast.net /i/) ────────────────────────────────────────
  app.use("/i", async (req, res) => {
    const targetUrl = `https://akumast.net/i${req.url}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          "Referer": "https://animefire.io/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);

      const reader = response.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: "No response body" });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.length;
        if (totalSize > MAX_PROXY_RESPONSE_SIZE) {
          reader.cancel();
          return res.status(413).json({ error: "Response too large" });
        }
        chunks.push(Buffer.from(value));
      }

      res.send(Buffer.concat(chunks));
    } catch {
      res.status(500).json({ error: "Image proxy error" });
    }
  });

  // ── CORS proxy ────────────────────────────────────────────────────────
  const ALLOWED_PROXY_HOSTS = ["api.animefire.io"];
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    setCorsHeaders(req, res);

    // Validate URL: correct host + no path traversal
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (!ALLOWED_PROXY_HOSTS.includes(parsedUrl.hostname)) {
      return res.status(403).json({ error: "Host not allowed" });
    }

    // Block path traversal attempts
    const decodedPath = decodeURIComponent(parsedUrl.pathname);
    if (decodedPath.includes("..") || decodedPath.includes("//")) {
      return res.status(403).json({ error: "Path not allowed" });
    }

    // Only allow safe path patterns
    if (!/^\/(animes|anime|episode)\//.test(decodedPath)) {
      return res.status(403).json({ error: "Path not allowed" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": "https://animefire.io",
          "Referer": "https://animefire.io/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
      }

      const contentType = response.headers.get("content-type") || "";

      // Stream binary data with size limit
      if (contentType.includes("dash") || contentType.includes("mp4") || contentType.includes("octet-stream") || contentType.includes("xml") || targetUrl.includes(".mpd") || targetUrl.includes(".m4s") || targetUrl.includes("/i/")) {
        const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
        if (contentLength > MAX_PROXY_RESPONSE_SIZE) {
          return res.status(413).json({ error: "Response too large" });
        }

        res.setHeader("Content-Type", contentType || "application/octet-stream");

        // Stream with size tracking
        const reader = response.body?.getReader();
        if (!reader) {
          return res.status(500).json({ error: "No response body" });
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalSize += value.length;
          if (totalSize > MAX_PROXY_RESPONSE_SIZE) {
            reader.cancel();
            return res.status(413).json({ error: "Response too large" });
          }
          chunks.push(Buffer.from(value));
        }

        res.send(Buffer.concat(chunks));
        return;
      }

      // Text/JSON responses with size limit
      const body = await response.text();
      if (body.length > MAX_JSON_RESPONSE_SIZE) {
        return res.status(413).json({ error: "Response too large" });
      }

      if (contentType.includes("json")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      } else {
        res.setHeader("Content-Type", contentType || "text/html; charset=utf-8");
      }
      res.send(body);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── SPA fallback ─────────────────────────────────────────────────────────
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) {
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/stream") || req.path.startsWith("/i")) {
        return res.status(404).json({ error: "Not found" });
      }
      res.sendFile(indexPath);
    });
  } else {
    app.use((req, res) => {
      res.status(404).json({ error: "Not found" });
    });
  }

  const port = 3001;
  server.listen(port, () => {
    console.log(`[Server] Running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
