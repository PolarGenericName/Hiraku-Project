import express from "express";
import { createServer } from "http";

const ANILIST_API = "https://graphql.anilist.co";

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
    headers: { "Content-Type": "application/json" },
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
  app.use(express.json());
  const server = createServer(app);

  // AniList GraphQL proxy - avoids CORS and rate limit issues from browser
  app.post("/api/anilist", async (req, res) => {
    console.log("[AniList] Received request, body keys:", Object.keys(req.body || {}));
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
          "Origin": "https://hiraku.app",
          "Referer": "https://hiraku.app/",
        },
        body: JSON.stringify(req.body),
      });

      clearTimeout(timeout);
      console.log("[AniList] Upstream status:", response.status);

      const data = await response.json();
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json(data);
    } catch (error: any) {
      console.error("[AniList] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Trailer endpoint - fetches YouTube trailer from AniList
  app.get("/api/trailer/:id", async (req, res) => {
    const anilistId = parseInt(req.params.id, 10);
    if (isNaN(anilistId)) {
      return res.status(400).json({ error: "Invalid AniList ID" });
    }

    console.log("[Trailer] Fetching trailer for AniList ID:", anilistId);

    try {
      const trailer = await fetchAniListTrailer(anilistId);
      if (!trailer) {
        return res.status(404).json({ error: "No trailer found" });
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json(trailer);
    } catch (error: any) {
      console.error("[Trailer] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // YouTube trailer search - fallback when AniList has no trailer
  app.get("/api/trailer-search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    console.log("[TrailerSearch] Searching YouTube for:", query);

    try {
      const searchQuery = encodeURIComponent(`${query} official trailer`);
      const response = await fetch(`https://www.youtube.com/results?search_query=${searchQuery}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = await response.text();

      // Extract video IDs from YouTube search results
      // YouTube embeds video data in JSON within the HTML
      const videoIdMatch = html.match(/"videoId":"([^"]+)"/);
      if (!videoIdMatch) {
        console.log("[TrailerSearch] No video found");
        return res.status(404).json({ error: "No trailer found" });
      }

      const videoId = videoIdMatch[1];
      console.log("[TrailerSearch] Found video:", videoId);

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({
        videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    } catch (error: any) {
      console.error("[TrailerSearch] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // CORS proxy - forwards any URL
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    console.log("[Proxy] Fetching:", targetUrl.substring(0, 150));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": "https://animefire.io",
          "Referer": "https://animefire.io/",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.log("[Proxy] Upstream error:", response.status);
        return res
          .status(response.status)
          .json({ error: `Upstream returned ${response.status}` });
      }

      const contentType = response.headers.get("content-type") || "";

      // Stream binary data (video segments, manifests)
      if (contentType.includes("dash") || contentType.includes("mp4") || contentType.includes("octet-stream") || contentType.includes("xml") || targetUrl.includes(".mpd") || targetUrl.includes(".m4s") || targetUrl.includes("/i/")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", contentType || "application/octet-stream");

        const buffer = await response.arrayBuffer();
        console.log("[Proxy] Stream OK, type:", contentType.substring(0, 30), "size:", buffer.byteLength);
        res.send(Buffer.from(buffer));
        return;
      }

      // Text/JSON responses
      const body = await response.text();
      console.log("[Proxy] OK, type:", contentType.substring(0, 30), "length:", body.length);

      res.setHeader("Access-Control-Allow-Origin", "*");
      if (contentType.includes("json")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      } else {
        res.setHeader("Content-Type", contentType || "text/html; charset=utf-8");
      }
      res.send(body);
    } catch (error: any) {
      console.error("[Proxy] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  const port = 3001;
  server.listen(port, () => {
    console.log(`[Proxy] Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
