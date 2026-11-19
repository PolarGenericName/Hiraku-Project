import express from "express";
import { createServer } from "http";
import { connect as http2Connect } from "http2";
import path from "path";
import fs from "fs";
import { gunzipSync, inflateSync, brotliDecompressSync } from "zlib";

// Catálogo das extensões portadas (só dados — arquivo gerado, sem dependências de browser)
import { KEIYOUSHI_ENTRIES } from "../ui/src/manga/sources/keiyoushi/manifest";
import { KEIYOUSHI_CUSTOM_ENTRIES } from "../ui/src/manga/sources/keiyoushi/custom";

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
  // Páginas de capítulo/capas das extensões portadas (várias por leitura)
  if (pathname === "/api/ext/image") {
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

// Detécta o tipo de imagem pelos magic bytes — CDNs servem conteúdo válido com
// content-type genérico (ex.: application/octet-stream do e2-2.dev).
function imageTypeFromMagic(head: Buffer): string | null {
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && head.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (head.length >= 6 && head.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (head.length >= 12 && head.toString("ascii", 4, 8) === "ftyp") {
    const brand = head.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1") return "image/heic";
  }
  return null;
}

// Envia o corpo do upstream como imagem: usa o content-type declarado quando já
// é image/*, senão identifica pelos magic bytes (o stream é lido só até ter
// bytes suficientes para o reconhecimento). Retorna "not-image" quando o corpo
// não é uma imagem (challenge/HTML no lugar da imagem).
async function pipeImageUpstream(
  res: express.Response,
  response: globalThis.Response,
  maxBytes: number,
  declaredType: string,
): Promise<"ok" | "too-large" | "aborted" | "not-image"> {
  const body = response.body;
  if (!body) return "aborted";
  const reader = body.getReader();
  let total = 0;
  let head = Buffer.alloc(0);
  let contentType = declaredType.startsWith("image/") ? declaredType : "";
  try {
    // Fase de sniff (só quando o tipo declarado não é image/*)
    while (!contentType && head.length < 16) {
      const { done, value } = await reader.read();
      if (done) break;
      head = Buffer.concat([head, Buffer.from(value)]);
    }
    if (!contentType) {
      contentType = imageTypeFromMagic(head) ?? "";
      if (!contentType) {
        await reader.cancel().catch(() => {});
        return "not-image";
      }
    }

    const write = async (chunk: Buffer): Promise<"ok" | "stop"> => {
      if (!chunk.length) return "ok";
      total += chunk.length;
      if (total > maxBytes) return "stop";
      if (!res.write(chunk)) {
        await waitForDrain(res);
        if (!guardResponse(res)) return "stop";
      }
      return "ok";
    };

    if (!guardResponse(res)) {
      await reader.cancel().catch(() => {});
      return "aborted";
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if ((await write(head)) === "stop") {
      await reader.cancel().catch(() => {});
      return "too-large";
    }
    while (true) {
      if (!guardResponse(res)) {
        await reader.cancel().catch(() => {});
        return "aborted";
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!guardResponse(res)) {
        await reader.cancel().catch(() => {});
        return "aborted";
      }
      if ((await write(Buffer.from(value))) === "stop") {
        await reader.cancel().catch(() => {});
        return "too-large";
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
  app.use(["/api/proxy", "/api/anilist", "/api/trailer", "/api/trailer-search", "/api/mangadex", "/api/ext", "/api/repo", "/stream", "/i"], rejectForeignOrigin);

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

  // ── MangaDex API proxy (manga section) ────────────────────────────────────
  // GET /api/mangadex?path=/manga?title=... — forwards to api.mangadex.org
  // Only GET JSON endpoints are exposed; path must stay within the API root.
  app.get("/api/mangadex", wrap(async (req, res) => {
    const targetPath = req.query.path as string;
    if (!targetPath || typeof targetPath !== "string" || targetPath.length > 2048) {
      return res.status(400).json({ error: "Missing path parameter" });
    }

    setCorsHeaders(req, res);

    // Path must be a plain API path: no scheme, no host, no traversal
    if (!targetPath.startsWith("/") || targetPath.startsWith("//") || targetPath.includes("..")) {
      return res.status(400).json({ error: "Invalid path" });
    }
    if (/[a-z][a-z0-9+.-]*:/i.test(targetPath)) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const cacheKey = `mangadex:${targetPath}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return res.json(cached.data);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`https://api.mangadex.org${targetPath}`, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "User-Agent": "Hiraku/1.0 (https://github.com/PolarGenericName/Hiraku-Project)",
          },
        });

        const text = await response.text();
        if (text.length > MAX_JSON_RESPONSE_SIZE) {
          if (guardResponse(res)) res.status(413).json({ error: "Response too large" });
          return;
        }

        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          if (guardResponse(res)) res.status(502).json({ error: "Invalid upstream response" });
          return;
        }

        if (response.ok) {
          cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
          if (cache.size > 500) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
          }
        }

        if (guardResponse(res)) res.status(response.status).json(data);
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      if (guardResponse(res)) res.status(500).json({ error: "Internal server error" });
    }
  }));

  // ── MangaDex cover image proxy ────────────────────────────────────────────
  // O CDN de capas (uploads.mangadex.org) serve uma verificação de navegador
  // para clientes não-residentes (browsers headless/WinHTTP recebem HTML de
  // challenge em vez da imagem). O servidor (Node) passa pelo gate, então as
  // capas passam por aqui. As páginas do leitor (*.mangadex.network) não são
  // gateadas e continuam diretas no cliente.
  const MANGADEX_IMAGE_HOSTS = ["uploads.mangadex.org"];
  const MAX_COVER_SIZE = 5 * 1024 * 1024; // capas .512.jpg ~130KB

  app.get("/api/mangadex/image", wrap(async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || typeof targetUrl !== "string" || targetUrl.length > 4096) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    setCorsHeaders(req, res);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (parsedUrl.protocol !== "https:") {
      return res.status(400).json({ error: "Only https URLs allowed" });
    }
    if (!MANGADEX_IMAGE_HOSTS.includes(parsedUrl.hostname)) {
      return res.status(403).json({ error: "Host not allowed" });
    }
    if (parsedUrl.username || parsedUrl.password) {
      return res.status(403).json({ error: "Credentials not allowed" });
    }
    if (parsedUrl.port && parsedUrl.port !== "443") {
      return res.status(403).json({ error: "Port not allowed" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Hiraku/1.0 (https://github.com/PolarGenericName/Hiraku-Project)",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });

      clearTimeout(timeout);

      // Redirecionamento só é aceito se o destino final também estiver na lista
      let finalHost = "";
      try {
        finalHost = new URL(response.url).hostname;
      } catch {
        /* usa o hostname original */
      }
      if (finalHost && !MANGADEX_IMAGE_HOSTS.includes(finalHost)) {
        if (guardResponse(res)) return res.status(403).json({ error: "Redirect target not allowed" });
        return;
      }

      if (!response.ok) {
        if (guardResponse(res)) return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!response.body) {
        if (guardResponse(res)) return res.status(500).json({ error: "No response body" });
        return;
      }

      const result = await pipeImageUpstream(res, response, MAX_COVER_SIZE, contentType);
      if (result === "not-image") {
        // Challenge ou resposta inesperada do CDN
        if (guardResponse(res)) return res.status(502).json({ error: "Upstream did not return an image" });
        return;
      }
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

  // ── Keiyoushi extension proxy (manga section) ──────────────────────────────
  // Rede das extensões Keiyoushi portadas para TS (ver
  // ui/src/manga/sources/keiyoushi/manifest.ts — Apache 2.0):
  //   GET  /api/ext?url=...       → HTML/JSON de página (texto)
  //   POST /api/ext {url, form}   → formulário (wp-admin/admin-ajax.php etc.)
  //   GET  /api/ext/image?url=... → imagem em streaming (Referer do site)
  // Allowlist: hosts do manifesto + subdomínios; https só, sem credenciais,
  // cada salto de redirecionamento revalidado (anti-SSRF), limite de tamanho
  // e cadência por host (~3 req/s) para não estranhar o site.
  const EXT_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const MAX_EXT_TEXT_SIZE = 8 * 1024 * 1024; // 8MB (páginas de mangá grandes)
  const EXT_CHALLENGE_RE = /just a moment|cf-chl|challenge-platform|_cf_chl/i;

  // root host → Referer (origem do site, para passar no hotlink check)
  const EXT_ROOTS = new Map<string, string>();
  // hosts que só respondem em http puro (sem TLS) — exceção no validateExtUrl
  const EXT_INSECURE_HOSTS = new Set<string>();
  for (const entry of [...KEIYOUSHI_ENTRIES, ...KEIYOUSHI_CUSTOM_ENTRIES]) {
    let origin: string;
    try {
      origin = new URL(entry.baseUrl).origin;
    } catch {
      continue;
    }
    const host = new URL(entry.baseUrl).hostname;
    if (!EXT_ROOTS.has(host)) EXT_ROOTS.set(host, `${origin}/`);
    for (const extra of entry.extraHosts ?? []) {
      if (!EXT_ROOTS.has(extra)) EXT_ROOTS.set(extra, `${origin}/`);
    }
    for (const insecure of "insecureHosts" in entry ? entry.insecureHosts ?? [] : []) {
      EXT_INSECURE_HOSTS.add(insecure);
    }
  }

  function extRefererFor(hostname: string): string | null {
    const h = hostname.toLowerCase();
    const exact = EXT_ROOTS.get(h);
    if (exact) return exact;
    for (const [root, referer] of EXT_ROOTS) {
      if (h.endsWith(`.${root}`)) return referer;
    }
    return null;
  }

  function validateExtUrl(raw: unknown): { url: URL; referer: string } | null {
    if (typeof raw !== "string" || raw.length > 4096) return null;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    const allowedProtocol =
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && EXT_INSECURE_HOSTS.has(parsed.hostname.toLowerCase()));
    if (!allowedProtocol) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== "443") return null;
    if (isBlockedRepoHost(parsed.hostname)) return null;
    const referer = extRefererFor(parsed.hostname);
    if (!referer) return null;
    return { url: parsed, referer };
  }

  /** GET/POST seguindo redirecionamentos com revalidação em cada salto. */
  async function fetchExt(
    start: URL,
    makeInit: (target: URL) => RequestInit,
  ): Promise<Response> {
    let current = start;
    for (let hop = 0; hop <= 5; hop++) {
      const response = await fetch(current, { ...makeInit(current), redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        void response.body?.cancel();
        if (!location) return response;
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return response;
        }
        const check = validateExtUrl(next.toString());
        if (!check) {
          throw Object.assign(new Error("Redirect target not allowed"), { extStatus: 403 });
        }
        current = check.url;
        continue;
      }
      return response;
    }
    throw Object.assign(new Error("Too many redirects"), { extStatus: 508 });
  }

  /**
   * GET via HTTP/2 — alguns endpoints (ex.: /api/atfield/key do Aurora) só
   * respondem a requisições h2, como as do navegador (o fetch do Node é h1.1
   * e recebe 403 "unauthorized"). Segue as mesmas regras de validação de host
   * e de revalidação de cada salto de redirect do fetchExt.
   */
  async function fetchExtH2(
    start: URL,
    makeHeaders: (target: URL) => Record<string, unknown>,
  ): Promise<Response> {
    let current = start;
    for (let hop = 0; hop <= 5; hop++) {
      const { status, rawHeaders, body } = await h2Request(current, makeHeaders(current));
      const headers = new Headers();
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (key.startsWith(":")) continue; // pseudo-headers (:status) não existem no Headers
        if (Array.isArray(value)) for (const item of value) headers.append(key, String(item));
        else if (value !== undefined) headers.set(key, String(value));
      }
      let payload = body;
      const encoding = headers.get("content-encoding")?.toLowerCase();
      if (encoding && encoding !== "identity") {
        try {
          payload =
            encoding === "gzip" ? gunzipSync(body)
            : encoding === "br" ? brotliDecompressSync(body)
            : encoding === "deflate" ? inflateSync(body)
            : body;
          headers.delete("content-encoding");
          headers.delete("content-length");
        } catch {
          /* mantém o corpo cru */
        }
      }
      if (status >= 300 && status < 400) {
        const location = headers.get("location");
        if (!location) return new Response(payload, { status, headers });
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return new Response(payload, { status, headers });
        }
        const check = validateExtUrl(next.toString());
        if (!check) {
          throw Object.assign(new Error("Redirect target not allowed"), { extStatus: 403 });
        }
        current = check.url;
        continue;
      }
      return new Response(status === 204 || status === 304 ? null : payload, { status, headers });
    }
    throw Object.assign(new Error("Too many redirects"), { extStatus: 508 });
  }

  /** Uma requisição HTTP/2 (conexão por chamada — volume baixo: keys de página). */
  function h2Request(
    target: URL,
    headers: Record<string, unknown>,
  ): Promise<{ status: number; rawHeaders: Record<string, unknown>; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const client = http2Connect(target.origin);
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          client.close();
        } catch {
          /* já fechado */
        }
        reject(error);
      };
      client.on("error", fail);
      const requestHeaders: Record<string, string> = {
        ":method": "GET",
        ":path": `${target.pathname}${target.search}`,
        ":authority": target.host,
        ":scheme": "https",
      };
      for (const [key, value] of Object.entries(headers)) {
        if (value === undefined || value === null) continue;
        requestHeaders[key.toLowerCase()] = String(value);
      }
      const request = client.request(requestHeaders);
      const chunks: Buffer[] = [];
      let status = 0;
      let rawHeaders: Record<string, unknown> = {};
      timer = setTimeout(() => fail(new Error("HTTP/2 request timed out")), 25_000);
      request.on("response", (responseHeaders) => {
        status = Number(responseHeaders[":status"]);
        rawHeaders = responseHeaders as unknown as Record<string, unknown>;
      });
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("error", fail);
      request.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          client.close();
        } catch {
          /* já fechado */
        }
        resolve({ status, rawHeaders, body: Buffer.concat(chunks) });
      });
      request.end();
    });
  }

  // Headers que as fontes portadas podem pedir por chamada (o navegador
  // bloqueia Origin/Cookie direto no fetch; temas como Aurora, Hiper e
  // GreenShit exigem headers específicos para liberar a resposta).
  const EXT_HEADER_ALLOW = new Set([
    "origin", "referer", "cookie", "accept", "accept-language",
    "rsc", "next-url", "next-router-state-tree", "next-router-prefetch",
    "alt-used", "scan-id", "x-flux-node", "x-requested-with",
    // MangoTheme (Império da Britannia): cache e bypass da criptografia + token
    "x-api-token", "x-brit-cache", "x-noencryptionbritta",
    // Headers de navegação (Cloudflare de alguns sites exige — ex.: Aurora)
    "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "sec-fetch-user",
    "upgrade-insecure-requests",
  ]);

  /** Valida headers pedidos pelo cliente (chaves allowlistadas, sem CRLF). */
  function sanitizeExtHeaders(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    let count = 0;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (!EXT_HEADER_ALLOW.has(lower)) continue;
      if (typeof value !== "string" || value.length > 2048) continue;
      if (/[\r\n]/.test(value)) continue;
      if (++count > 16) break;
      out[lower] = value;
    }
    return out;
  }

  /**
   * Sec-Fetch-Site coerente com o Referer enviado (paridade com navegador).
   * O Cloudflare de alguns sites (Aurora) exige os headers de navegação.
   */
  function extFetchSite(target: URL, referer: string): string {
    if (!referer) return "none";
    let ref: URL;
    try {
      ref = new URL(referer);
    } catch {
      return "none";
    }
    if (ref.origin === target.origin) return "same-origin";
    const etld = (host: string) => host.split(".").slice(-2).join(".");
    return etld(ref.hostname) === etld(target.hostname) ? "same-site" : "cross-site";
  }

  function extTextInit(target: URL, xhr: boolean, extra: Record<string, string> = {}): RequestInit {
    const referer = extRefererFor(target.hostname) || `${target.origin}/`;
    const site = extFetchSite(target, referer);
    const headers = {
      "User-Agent": EXT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Referer: referer,
      ...(xhr
        ? {
            "X-Requested-With": "XMLHttpRequest",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": site,
          }
        : {
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": site,
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
          }),
      ...extra,
    };
    if (process.env.EXT_DEBUG) console.log("[ext-debug]", target.toString(), JSON.stringify(headers));
    return { headers };
  }

  /**
   * Expõe ao cliente (via header da resposta) os cookies setados pelo site e
   * a flag x-encrypted — o navegador não deixa o JS ler Set-Cookie.
   * São devolvidos apenas pares name=value (sem atributos).
   */
  function extResponseMeta(response: Response): { setCookie: string; encrypted: boolean } {
    const pairs: string[] = [];
    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    for (const raw of typeof getSetCookie === "function" ? getSetCookie.call(response.headers) : []) {
      const pair = raw.split(";")[0].trim();
      if (pair && pair.includes("=") && !/[\r\n]/.test(pair)) pairs.push(pair);
    }
    return {
      setCookie: pairs.join("; "),
      encrypted: response.headers.get("x-encrypted")?.toLowerCase() === "true",
    };
  }

  // Cadência por host de texto (~3 req/s) — cadeia serializada por hostname
  const extChains = new Map<string, Promise<unknown>>();
  const extLastRun = new Map<string, number>();
  function withExtLimit<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const previous = extChains.get(host) ?? Promise.resolve();
    const run = previous.then(async () => {
      const last = extLastRun.get(host) ?? 0;
      const wait = Math.max(0, last + 300 - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      extLastRun.set(host, Date.now());
      return fn();
    });
    extChains.set(host, run.catch(() => undefined));
    return run;
  }

  function sendExtText(
    res: express.Response,
    status: number,
    contentType: string,
    body: string,
    meta?: { setCookie?: string; encrypted?: boolean },
  ) {
    if (!guardResponse(res)) return;
    res.status(status);
    res.setHeader("Content-Type", contentType || "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (meta?.setCookie) res.setHeader("X-Ext-Set-Cookie", meta.setCookie);
    if (meta?.encrypted) res.setHeader("X-Ext-Encrypted", "1");
    res.send(body);
  }

  // GET /api/ext?url=...&hdr=... — páginas HTML/JSON das fontes portadas
  app.get("/api/ext", wrap(async (req, res) => {
    setCorsHeaders(req, res);
    const check = validateExtUrl(req.query.url);
    if (!check) {
      if (guardResponse(res)) res.status(403).json({ error: "Host not allowed" });
      return;
    }
    const { url } = check;
    const xhr = req.query.xhr === "1";
    const useH2 = req.query.h2 === "1";
    const extraHeaders = sanitizeExtHeaders(parseExtHdrParam(req.query.hdr));
    // Resposta varia com headers (rsc, cookie, …) — não serve do cache genérico
    const cacheable = Object.keys(extraHeaders).length === 0;
    const cacheKey = `ext:${url}`;
    if (cacheable) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() < cached.expires) {
        sendExtText(res, cached.data.status, cached.data.contentType, cached.data.body);
        return;
      }
    }

    try {
      const data = await withExtLimit(url.hostname, async () => {
        const response = useH2
          ? await fetchExtH2(
              url,
              (target) =>
                extTextInit(target, xhr, extraHeaders).headers as unknown as Record<string, unknown>,
            )
          : await fetchExt(url, (target) => extTextInit(target, xhr, extraHeaders));
        const contentType = response.headers.get("content-type") || "";
        const body = await response.text();
        const meta = extResponseMeta(response);
        if (body.length > MAX_EXT_TEXT_SIZE) {
          return { status: 413, contentType: "application/json", body: JSON.stringify({ error: "Response too large" }), ...meta };
        }
        if (
          response.headers.get("cf-mitigated")?.toLowerCase() === "challenge" ||
          ((response.status === 403 || response.status === 503 || response.status === 200) &&
            EXT_CHALLENGE_RE.test(body) &&
            /<title[^>]*>\s*just a moment/i.test(body))
        ) {
          return { status: 503, contentType: "application/json", body: JSON.stringify({ error: "cloudflare" }), ...meta };
        }
        return {
          status: response.status,
          contentType: contentType || "text/html; charset=utf-8",
          body,
          ...meta,
        };
      });

      if (cacheable && data.status >= 200 && data.status < 400) {
        cache.set(cacheKey, { data, expires: Date.now() + 30_000 });
        if (cache.size > 500) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
      }
      sendExtText(res, data.status, data.contentType, data.body, data);
    } catch (error) {
      const status = (error as { extStatus?: number })?.extStatus;
      if (process.env.EXT_DEBUG) console.error("[ext-debug] falha:", error);
      if (guardResponse(res)) {
        res.status(status ?? 502).json({ error: status ? String((error as Error).message) : "Extension fetch failed" });
      }
    }
  }));

  /** Lê o parâmetro hdr (JSON de headers) vindo da query string. */
  function parseExtHdrParam(raw: unknown): unknown {
    if (typeof raw !== "string" || raw.length > 8192) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function sanitizeExtForm(form: unknown): Record<string, string> | null {
    if (!form || typeof form !== "object" || Array.isArray(form)) return null;
    const out: Record<string, string> = {};
    let total = 0;
    for (const [key, value] of Object.entries(form as Record<string, unknown>)) {
      if (typeof value !== "string" || key.length > 200 || value.length > 4000) return null;
      total += key.length + value.length;
      out[key] = value;
    }
    if (total > 16_000) return null;
    return out;
  }

  // POST /api/ext — formulários (madara_load_more, manga_get_chapters, …)
  app.post("/api/ext", wrap(async (req, res) => {
    setCorsHeaders(req, res);
    const check = validateExtUrl(req.body?.url);
    if (!check) {
      if (guardResponse(res)) res.status(403).json({ error: "Host not allowed" });
      return;
    }
    // corpo JSON (APIs como a do ManGeek) OU formulário clássico
    const hasJson = req.body?.json !== undefined;
    const form = sanitizeExtForm(req.body?.form);
    if (!hasJson && !form) {
      if (guardResponse(res)) res.status(400).json({ error: "Invalid form" });
      return;
    }
    const { url } = check;
    const xhr = req.body?.xhr !== false;
    const extraHeaders = sanitizeExtHeaders(req.body?.headers);

    try {
      const data = await withExtLimit(url.hostname, async () => {
        const body = hasJson
          ? JSON.stringify(req.body.json)
          : new URLSearchParams(form ?? {}).toString();
        const response = await fetchExt(url, (target) => ({
          ...extTextInit(target, xhr, extraHeaders),
          method: "POST",
          headers: {
            ...extTextInit(target, xhr, extraHeaders).headers,
            "Content-Type": hasJson
              ? "application/json; charset=UTF-8"
              : "application/x-www-form-urlencoded; charset=UTF-8",
          },
          body,
        }));
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        const meta = extResponseMeta(response);
        if (text.length > MAX_EXT_TEXT_SIZE) {
          return { status: 413, contentType: "application/json", body: JSON.stringify({ error: "Response too large" }), ...meta };
        }
        if (
          response.headers.get("cf-mitigated")?.toLowerCase() === "challenge" ||
          ((response.status === 403 || response.status === 503) &&
            EXT_CHALLENGE_RE.test(text) &&
            /<title[^>]*>\s*just a moment/i.test(text))
        ) {
          return { status: 503, contentType: "application/json", body: JSON.stringify({ error: "cloudflare" }), ...meta };
        }
        return {
          status: response.status,
          contentType: contentType || "text/html; charset=utf-8",
          body: text,
          ...meta,
        };
      });
      sendExtText(res, data.status, data.contentType, data.body, data);
    } catch (error) {
      const status = (error as { extStatus?: number })?.extStatus;
      if (guardResponse(res)) {
        res.status(status ?? 502).json({ error: status ? String((error as Error).message) : "Extension fetch failed" });
      }
    }
  }));

  // GET /api/ext/image?url=... — capas e páginas de capítulo em streaming
  app.get("/api/ext/image", wrap(async (req, res) => {
    setCorsHeaders(req, res);
    const check = validateExtUrl(req.query.url);
    if (!check) {
      if (guardResponse(res)) res.status(403).json({ error: "Host not allowed" });
      return;
    }
    const { url } = check;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const response = await fetchExt(url, (target) => ({
        headers: {
          "User-Agent": EXT_USER_AGENT,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          Referer: extRefererFor(target.hostname) || `${target.origin}/`,
        },
        signal: controller.signal,
      }));
      clearTimeout(timeout);

      if (response.headers.get("cf-mitigated")?.toLowerCase() === "challenge") {
        if (guardResponse(res)) res.status(503).json({ error: "cloudflare" });
        return;
      }
      if (!response.ok) {
        if (guardResponse(res)) res.status(response.status).json({ error: `Upstream returned ${response.status}` });
        return;
      }
      const contentType = response.headers.get("content-type") || "";
      const result = await pipeImageUpstream(res, response, MAX_PROXY_RESPONSE_SIZE, contentType);
      if (result === "not-image" || (result === "aborted" && !res.headersSent)) {
        // challenge/HTML no lugar da imagem (ou corpo ausente)
        if (guardResponse(res)) res.status(502).json({ error: "Upstream did not return an image" });
        return;
      }
      if (result === "too-large") {
        if (!res.headersSent && guardResponse(res)) res.status(413).json({ error: "Response too large" });
        else if (!res.destroyed) res.destroy();
      }
    } catch {
      clearTimeout(timeout);
      if (guardResponse(res)) res.status(502).json({ error: "Image fetch failed" });
    } finally {
      clearTimeout(timeout);
    }
  }));

  // ── Source repository index proxy (manga section) ─────────────────────────
  // GET /api/repo?url=https://... — baixa índices de repositórios de fontes
  // (repo.json / index.min.json, formato Mihon/Keiyoushi) contornando o CORS
  // do browser. Apenas https, sem hosts internos (anti-SSRF), 5MB, 15s.
  const REPO_REDIRECT_LIMIT = 3;

  function isBlockedRepoHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
    if (h.includes(":")) return true; // IPv6 (loopback/link-local/ULA)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
    }
    return false;
  }

  function validateRepoUrl(raw: string): URL | null {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(raw);
    } catch {
      return null;
    }
    if (parsedUrl.protocol !== "https:") return null;
    if (parsedUrl.username || parsedUrl.password) return null;
    if (parsedUrl.port && parsedUrl.port !== "443") return null;
    if (isBlockedRepoHost(parsedUrl.hostname)) return null;
    return parsedUrl;
  }

  app.get("/api/repo", wrap(async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || typeof targetUrl !== "string" || targetUrl.length > 4096) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    setCorsHeaders(req, res);

    let currentUrl = validateRepoUrl(targetUrl);
    if (!currentUrl) {
      return res.status(400).json({ error: "Invalid URL (apenas https, sem hosts internos)" });
    }

    const cacheKey = `repo:${currentUrl.toString()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return res.json(cached.data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      // Redirects seguem um a um para validar cada destino (anti-SSRF)
      let response: globalThis.Response | null = null;
      for (let hop = 0; ; hop++) {
        const attempt = await fetch(currentUrl.toString(), {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Hiraku/1.0 (https://github.com/PolarGenericName/Hiraku-Project)",
          },
        });

        if (attempt.status >= 300 && attempt.status < 400) {
          await attempt.body?.cancel().catch(() => {});
          if (hop >= REPO_REDIRECT_LIMIT) {
            if (guardResponse(res)) res.status(502).json({ error: "Too many redirects" });
            return;
          }
          const location = attempt.headers.get("location");
          if (!location) {
            if (guardResponse(res)) res.status(502).json({ error: "Redirect sem destino" });
            return;
          }
          let nextUrl: URL | null;
          try {
            nextUrl = validateRepoUrl(new URL(location, currentUrl).toString());
          } catch {
            nextUrl = null;
          }
          if (!nextUrl) {
            if (guardResponse(res)) res.status(403).json({ error: "Redirect target not allowed" });
            return;
          }
          currentUrl = nextUrl;
          continue;
        }

        response = attempt;
        break;
      }

      clearTimeout(timeout);

      if (!response) {
        if (guardResponse(res)) res.status(500).json({ error: "Repository fetch failed" });
        return;
      }

      if (!response.ok) {
        if (guardResponse(res)) res.status(response.status).json({ error: `Upstream returned ${response.status}` });
        return;
      }

      let buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > MAX_JSON_RESPONSE_SIZE) {
        if (guardResponse(res)) res.status(413).json({ error: "Response too large" });
        return;
      }

      // Sniff de gzip (magic 0x1f8b) — o Mihon faz o mesmo ao baixar índices
      if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
          buf = gunzipSync(buf);
        } catch {
          // corpo não é gzip válido — segue com os bytes originais
        }
      }
      if (buf.length > MAX_JSON_RESPONSE_SIZE) {
        if (guardResponse(res)) res.status(413).json({ error: "Response too large" });
        return;
      }

      let data: unknown;
      try {
        data = JSON.parse(buf.toString("utf8"));
      } catch {
        // Não é JSON: pode ser o índice ProtoBuf (index.pb) — devolve em
        // base64 para o cliente decodificar. HTML/erro é rejeitado.
        const head = buf.subarray(0, 512).toString("utf8").trimStart();
        if (head.startsWith("<")) {
          if (guardResponse(res)) res.status(502).json({ error: "Invalid upstream response" });
          return;
        }
        data = { __protobuf: buf.toString("base64") };
      }
      if (typeof data !== "object" || data === null) {
        if (guardResponse(res)) res.status(502).json({ error: "Invalid repository index" });
        return;
      }

      cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
      if (cache.size > 500) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }

      if (guardResponse(res)) res.json(data);
    } catch {
      if (guardResponse(res)) res.status(500).json({ error: "Repository fetch failed" });
    } finally {
      clearTimeout(timeout);
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
    app.use((_req, res) => {
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
