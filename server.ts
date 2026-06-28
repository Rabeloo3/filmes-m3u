import express from "express";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import zlib from "zlib";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

/**
 * Robust HTTP/HTTPS proxy that:
 * 1. Automatically follows redirects (up to 10 hops)
 * 2. Bypasses expired, self-signed, or invalid SSL/TLS verification (common on IPTV servers)
 * 3. Supports legacy SSL/TLS versions and ciphers (very common on older self-hosted IPTV servers)
 * 4. Forces IPv4 (family: 4) to bypass misconfigured IPv6 routing and speed up DNS lookups
 * 5. Uses a VLC player User-Agent (universally whitelisted/accepted by all IPTV providers)
 * 6. Handles Content-Encoding (gzip/deflate) compression safely
 * 7. Rewrites HLS (M3U8) playlists dynamically so all segments are routed securely via this proxy
 * 8. Supports HTTP Range header forwarding for video scrubbing and quick buffering
 */
function requestUrl(
  targetUrl: string,
  clientHeaders: Record<string, any>,
  res: express.Response,
  isStream = false,
  redirectDepth = 0
) {
  if (redirectDepth > 10) {
    res.status(500).send("Excesso de redirecionamentos (Redirect loop detected).");
    return;
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    // Build headers to send to IPTV server
    // Use VLC player User-Agent - IPTV providers heavily filter out standard web browsers
    const headers: Record<string, string> = {
      "User-Agent": "VLC/3.0.18 LibVLC/3.0.18",
      "Accept": "*/*",
    };

    // Explicitly ask for uncompressed or handle compression
    headers["Accept-Encoding"] = "gzip, deflate, identity";

    // Forward range header if present (crucial for video players)
    if (clientHeaders["range"]) {
      headers["Range"] = clientHeaders["range"];
    }

    const options: any = {
      method: "GET",
      headers,
      family: 4, // Force IPv4 to avoid modern node IPv6 dns timeout bugs on older servers
      // Completely bypass SSL/TLS certificate validation
      rejectUnauthorized: false,
      agent: isHttps 
        ? new https.Agent({ 
            rejectUnauthorized: false, 
            keepAlive: true, 
            secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT, // Fix SSL handshake failures on older servers
            family: 4 
          }) 
        : new http.Agent({ keepAlive: true, family: 4 }),
    };

    const proxyReq = client.request(targetUrl, options, (proxyRes) => {
      const statusCode = proxyRes.statusCode || 200;

      // Handle redirects (e.g. 301, 302, 307, 308)
      if (statusCode >= 300 && statusCode < 400 && proxyRes.headers.location) {
        let nextUrl = proxyRes.headers.location;
        if (!nextUrl.startsWith("http")) {
          nextUrl = new URL(nextUrl, targetUrl).href;
        }
        return requestUrl(nextUrl, clientHeaders, res, isStream, redirectDepth + 1);
      }

      // Check Content-Encoding for decompression
      const contentEncoding = (proxyRes.headers["content-encoding"] || "").toLowerCase();
      let responseStream: NodeJS.ReadableStream = proxyRes;

      if (contentEncoding.includes("gzip")) {
        responseStream = proxyRes.pipe(zlib.createGunzip());
      } else if (contentEncoding.includes("deflate")) {
        responseStream = proxyRes.pipe(zlib.createInflate());
      }

      const contentType = (proxyRes.headers["content-type"] || "").toLowerCase();
      const isM3u8 = targetUrl.toLowerCase().includes(".m3u8") || 
                     targetUrl.toLowerCase().includes("m3u8") ||
                     contentType.includes("mpegurl") || 
                     contentType.includes("application/x-mpegurl") ||
                     contentType.includes("vnd.apple.mpegurl");

      if (isStream && isM3u8) {
        // Collect, decompress, and parse playlist text to rewrite relative links
        const chunks: Buffer[] = [];
        responseStream.on("data", (chunk) => chunks.push(chunk));
        responseStream.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString("utf-8");
            const lines = text.split("\n");
            const baseUri = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
            const origin = parsedUrl.origin;

            const rewrittenLines = lines.map(line => {
              const trimmed = line.trim();
              if (trimmed === "" || trimmed.startsWith("#")) {
                return line;
              }

              let absoluteUrl = trimmed;
              if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                if (trimmed.startsWith("/")) {
                  absoluteUrl = origin + trimmed;
                } else {
                  absoluteUrl = baseUri + trimmed;
                }
              }

              return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
            });

            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.send(rewrittenLines.join("\n"));
          } catch (e: any) {
            console.error("Error parsing/rewriting HLS:", e.message);
            res.status(500).send("Erro ao processar playlist HLS.");
          }
        });
      } else {
        // Direct media streaming or JSON responses
        res.status(statusCode);

        // Forward headers
        if (proxyRes.headers["content-type"]) res.setHeader("Content-Type", proxyRes.headers["content-type"]);
        if (proxyRes.headers["content-length"]) res.setHeader("Content-Length", proxyRes.headers["content-length"]);
        if (proxyRes.headers["content-range"]) res.setHeader("Content-Range", proxyRes.headers["content-range"]);
        if (proxyRes.headers["accept-ranges"]) res.setHeader("Accept-Ranges", proxyRes.headers["accept-ranges"]);

        res.setHeader("Access-Control-Allow-Origin", "*");
        responseStream.pipe(res);
      }
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy request connection error for:", targetUrl, err.message);
      if (!res.headersSent) {
        res.status(500).send("Erro de rede no proxy: " + err.message);
      }
    });

    // Close the upstream proxy request if the client disconnects or aborts
    res.on("close", () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } catch (err: any) {
    console.error("Invalid proxy target URL:", targetUrl, err.message);
    if (!res.headersSent) {
      res.status(400).send("URL inválida: " + err.message);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add highly permissive CORS headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    next();
  });

  // Proxy Xtream API endpoints securely (ignoring SSL errors and following redirects)
  app.get("/api/proxy", (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Parâmetro url em falta." });
    }
    requestUrl(targetUrl, req.headers, res, false);
  });

  // Proxy Live, VOD and Series video stream segments safely
  app.get("/api/stream", (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send("Falta o parâmetro url.");
    }
    requestUrl(targetUrl, req.headers, res, true);
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
