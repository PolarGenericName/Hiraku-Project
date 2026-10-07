import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";

const serverDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Run Express in production mode inside the packaged app (Electron main process)
if (process.versions.electron && !process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const ANILIST_API = "https://graphql.anilist.co";

// ── Security Constants ──────────────────────────────────────────────────────
const MAX_PROXY_RESPONSE_SIZE = 50 * 1024 * 1024; // 50MB max for proxy responses
const MAX_JSON_RESPONSE_SIZE = 5 * 1024 * 1024;   // 5MB max for JSON responses
const ALLOWED_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

// ── Rate Limiter (separate bucket per route class) ─────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  stream: 600,  // HLS segments + images
  api: 300,     // JSON APIs (search does 40-60 calls per query)
  static: 600,  // app assets
};

function bucketFor(pathname: string): { bucket: string; max: number } {
  if (pathname === "/stream" || pathname.startsWith("/stream/") || pathname === "/i" || pathname.startsWith("/i/")) {
    return { bucket: "stream", max: RATE_LIMITS.stream };
  }
  if (pathname.startsWith("/api")) return { bucket: "api", max: RATE_LIMITS.api };
  return { bucket: "static", max: RATE_LIMITS.static };
}

function isRateLimited(ip: string, bucket: string, max: number): boolean {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > max;
}

// Cleanup old entries every 5 minutes
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 300_000);
rateLimitCleanup.unref();

// ── CORS Helper ─────────────────────────────────────────────────────────────
function setCorsHeaders(req: express.Request, res: express.Response) {
  const origin = req.headers.origin || "";
  if (ALLOWED_CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.append("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Reject cross-origin browser requests to the proxy endpoints (local DoS guard)
function rejectForeignOrigin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_CORS_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }
  next();
}

// Express 4 does not catch rejected promises from async handlers
type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;
function wrap(fn: AsyncHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Abort upstream fetch and avoid writes once the client is gone
function guardResponse(res: express.Response): boolean {
  return !res.destroyed && !res.writableEnded;
}

// Wait for the socket to drain. Listeners are attached synchronously and the
// losing listener is always removed, so 'close' firing before the attach can
// never leave this promise pending forever (and nothing accumulates).
function waitForDrain(res: express.Response): Promise<void> {
  return new Promise((resolve) => {
    if (res.destroyed || res.writableEnded) {
      resolve();
      return;
    }
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      res.off("error", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
    res.once("error", done);
  });
}

// Stream an upstream response body to the client with size limit + backpressure
async function pipeUpstream(
  res: express.Response,
  response: globalThis.Response,
  maxBytes: number
): Promise<"ok" | "too-large" | "aborted"> {
  const body = response.body;
  if (!body) return "aborted";
  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      if (!guardResponse(res)) {
        await reader.cancel().catch(() => {});
        return "aborted";
      }
      const { done, value } = await reader.read();
      if (done) break;
      // The client may have disconnected while we were awaiting the read —
      // re-check before touching the socket
      if (!guardResponse(res)) {
        await reader.cancel().catch(() => {});
        return "aborted";
      }
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return "too-large";
      }
      if (!res.write(Buffer.from(value))) {
        await waitForDrain(res);
        if (!guardResponse(res)) {
          await reader.cancel().catch(() => {});
          return "aborted";
        }
      }
    }
    if (guardResponse(res)) res.end();
    return "ok";
  } catch {
    if (guardResponse(res)) res.end();
    return "aborted";
  }
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
    signal: AbortSignal.timeout(10_000),
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
  app.disable('x-powered-by');
  const server = createServer(app);

  // ── Rate limiting middleware (per route class) ───────────────────────────
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const { bucket, max } = bucketFor(req.path);
    if (isRateLimited(ip, bucket, max)) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  });

  // ── CORS preflight ──────────────────────────────────────────────────────
  app.options("*", (req, res) => {
    setCorsHeaders(req, res);
    res.sendStatus(204);
  });

  // ── Origin guard for proxy endpoints ────────────────────────────────────
  // Note: Express mount matching requires a path boundary, so "/api/trailer"
  // does NOT match "/api/trailer-search" — list it explicitly
  app.use(["/api/proxy", "/api/anilist", "/api/trailer", "/api/trailer-search", "/stream", "/i"], rejectForeignOrigin);

  // Body parser runs AFTER rate limiting and the origin guard, so malformed
  // or oversized payloads cannot bypass them
  app.use(express.json({ limit: "1mb" }));

  // ── Static files (production UI) ────────────────────────────────────────
  const staticDir = path.join(serverDir, "public");
  if (fs.existsSync(staticDir)) {
    app.use((_req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    });
    app.use(express.static(staticDir));
  }

  // ── AniList GraphQL proxy ───────────────────────────────────────────────
  app.post("/api/anilist", wrap(async (req, res) => {
    const query = req.body?.query || "";
    const variables = req.body?.variables || {};

    // Block introspection queries (but allow normal __typename selections)
    if (/\b__(schema|type)\b/.test(query)) {
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
      try {
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

        const data = await response.json();

        if (response.ok) {
          cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
          if (cache.size > 500) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
          }
        }

        res.json(data);
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      if (guardResponse(res)) res.status(500).json({ error: "Internal server error" });
    }
  }));

  // ── Trailer endpoint ────────────────────────────────────────────────────
  app.get("/api/trailer/:id", wrap(async (req, res) => {
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
  }));

  // ── YouTube trailer search ──────────────────────────────────────────────
  app.get("/api/trailer-search", wrap(async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    setCorsHeaders(req, res);

    try {
      const searchQuery = encodeURIComponent(`${query} official trailer`);
      const response = await fetch(`https://www.youtube.com/results?search_query=${searchQuery}`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = await response.text();
      if (html.length > 10_000_000) {
        return res.status(413).json({ error: "Upstream response too large" });
      }
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
  }));

  // ── Stream proxy (akumast.net) ───────────────────────────────────────
  app.use("/stream", wrap(async (req, res) => {
    const targetUrl = `https://akumast.net${req.url}`;
    // The mount strip must always yield a root-relative path — never a host suffix
    if (!targetUrl.startsWith("https://akumast.net/")) {
      if (guardResponse(res)) return res.status(400).json({ error: "Invalid stream path" });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        method: req.method,
        redirect: "error",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": "https://animefire.one",
          "Referer": "https://animefire.one/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (guardResponse(res)) return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
        return;
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const forcedType = contentType.includes("mpegurl")
        ? "application/vnd.apple.mpegurl"
        : contentType.includes("application/vnd.apple") || contentType.includes("dash")
          ? contentType
          : "application/octet-stream";
      res.setHeader("Content-Type", forcedType);
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (!response.body) {
        if (guardResponse(res)) return res.status(500).json({ error: "No response body" });
        return;
      }

      const result = await pipeUpstream(res, response, MAX_PROXY_RESPONSE_SIZE);
      if (result === "too-large") {
        if (!res.headersSent && guardResponse(res)) res.status(413).json({ error: "Response too large" });
        else if (!res.destroyed) res.destroy();
      }
    } catch {
      if (guardResponse(res)) res.status(500).json({ error: "Stream proxy error" });
    } finally {
      clearTimeout(timeout);
    }
  }));

  // ── Image proxy (akumast.net /i/) ────────────────────────────────────────
  app.use("/i", wrap(async (req, res) => {
    const targetUrl = `https://akumast.net/i${req.url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: "error",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          "Referer": "https://animefire.one/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (guardResponse(res)) return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      const safeType = contentType.startsWith("image/") ? contentType : "image/jpeg";
      res.setHeader("Content-Type", safeType);
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (!response.body) {
        if (guardResponse(res)) return res.status(500).json({ error: "No response body" });
        return;
      }

      const result = await pipeUpstream(res, response, MAX_PROXY_RESPONSE_SIZE);
      if (result === "too-large") {
        if (!res.headersSent && guardResponse(res)) res.status(413).json({ error: "Response too large" });
        else if (!res.destroyed) res.destroy();
      }
    } catch {
      if (guardResponse(res)) res.status(500).json({ error: "Image proxy error" });
    } finally {
      clearTimeout(timeout);
    }
  }));

  // ── CORS proxy ────────────────────────────────────────────────────────
  const ALLOWED_PROXY_HOSTS = ["api.animefire.one"];
  app.get("/api/proxy", wrap(async (req, res) => {
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

    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: "Only https URLs allowed" });
    }

    if (parsedUrl.username || parsedUrl.password) {
      return res.status(403).json({ error: "Credentials not allowed" });
    }

    if (parsedUrl.port && parsedUrl.port !== "443") {
      return res.status(403).json({ error: "Port not allowed" });
    }

    // Block path traversal attempts
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(parsedUrl.pathname);
    } catch {
      return res.status(400).json({ error: "Invalid URL path" });
    }
    if (decodedPath.includes("..") || decodedPath.includes("//")) {
      return res.status(403).json({ error: "Path not allowed" });
    }

    // Only allow safe path patterns
    if (!/^\/(animes|anime|episode)\//.test(decodedPath)) {
      return res.status(403).json({ error: "Path not allowed" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: "error",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": "https://animefire.one",
          "Referer": "https://animefire.one/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (guardResponse(res)) return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
        return;
      }

      res.setHeader("X-Content-Type-Options", "nosniff");
      const contentType = response.headers.get("content-type") || "";

      // Stream binary data with size limit
      if (contentType.includes("dash") || contentType.includes("mp4") || contentType.includes("octet-stream") || contentType.includes("xml") || targetUrl.includes(".mpd") || targetUrl.includes(".m4s") || targetUrl.includes("/i/")) {
        const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
        if (contentLength > MAX_PROXY_RESPONSE_SIZE) {
          return res.status(413).json({ error: "Response too large" });
        }

        // Never relay HTML to the app origin — only on this branch (binary/media)
        const lowerCt = contentType.toLowerCase();
        const safeContentType =
          lowerCt.includes("text/html") || lowerCt.includes("application/xhtml")
            ? "application/octet-stream"
            : contentType || "application/octet-stream";
        res.setHeader("Content-Type", safeContentType);

        if (!response.body) {
          if (guardResponse(res)) return res.status(500).json({ error: "No response body" });
          return;
        }

        const result = await pipeUpstream(res, response, MAX_PROXY_RESPONSE_SIZE);
        if (result === "too-large") {
          if (!res.headersSent && guardResponse(res)) res.status(413).json({ error: "Response too large" });
          else if (!res.destroyed) res.destroy();
        }
        return;
      }

      // Text/JSON responses with size limit
      const body = await response.text();
      if (body.length > MAX_JSON_RESPONSE_SIZE) {
        if (guardResponse(res)) return res.status(413).json({ error: "Response too large" });
        return;
      }

      // Force JSON content-type — this endpoint is only used for API data,
      // never serve upstream HTML at the app origin
      if (!guardResponse(res)) return;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(body);
    } catch {
      if (guardResponse(res)) res.status(500).json({ error: "Internal server error" });
    } finally {
      clearTimeout(timeout);
    }
  }));

  // ── SPA fallback ─────────────────────────────────────────────────────────
  const indexPath = path.join(serverDir, "public", "index.html");
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

  // ── Final error handler (catches escaped async errors) ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err as { status?: number; statusCode?: number } | null;
    const raw = typeof e?.status === "number" ? e.status : typeof e?.statusCode === "number" ? e.statusCode : 500;
    const status = raw >= 400 && raw < 600 ? raw : 500;
    if (status >= 500) console.error("[Server] Unhandled error:", err);
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json({ error: status >= 500 ? "Internal server error" : "Bad request" });
  });

  const port = 3001;
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Server] Port ${port} already in use - close the other Hiraku instance and restart.`);
    } else {
      console.error("[Server] Failed to start:", err);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[Server] Running on http://127.0.0.1:${port}/`);
  });
}

startServer().catch(console.error);
