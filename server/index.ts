import express from "express";
import { createServer } from "http";

async function startServer() {
  const app = express();
  const server = createServer(app);

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
