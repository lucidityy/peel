const express = require("express");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { spawn } = require("node:child_process");
const ffmpegPath = require("ffmpeg-static");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const sanitizeFilename = require("sanitize-filename");

const app = express();
const PORT = process.env.PORT || 3000;
const TMP_DIR = path.join(os.tmpdir(), "peel-downloads");
const IS_WIN = process.platform === "win32";
const YTDLP_FILENAME = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
// Prefer postinstall bin/ (dev & prod), fallback to tmpdir (serverless/cold)
const BIN_DIR = fsSync.existsSync(path.join(__dirname, "bin", YTDLP_FILENAME))
  ? path.join(__dirname, "bin")
  : path.join(os.tmpdir(), "peel-bin");
const YTDLP_PATH = path.join(BIN_DIR, YTDLP_FILENAME);

const MAX_URL_LENGTH = 2048;
const MAX_CONCURRENT = 3;
const YTDLP_TIMEOUT_MS = 120_000;
const STALE_FILE_MAX_AGE_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let activeJobs = 0;
let ytDlpSetupPromise = null;

if (!ffmpegPath) {
  throw new Error("ffmpeg-static binary not found.");
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fsSync.createWriteStream(destPath);
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          fsSync.unlink(destPath, () => {});
          const next = new URL(res.headers.location, url).href;
          downloadFile(next, destPath).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fsSync.unlink(destPath, () => {});
          reject(new Error(`yt-dlp download HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
      })
      .on("error", (err) => {
        file.close();
        fsSync.unlink(destPath, () => {});
        reject(err);
      });
  });
}

async function ensureYtDlpBinary() {
  if (fsSync.existsSync(YTDLP_PATH)) return;
  if (ytDlpSetupPromise) {
    await ytDlpSetupPromise;
    return;
  }

  ytDlpSetupPromise = (async () => {
    await fs.mkdir(BIN_DIR, { recursive: true });
    const fileName = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
    await downloadFile(url, YTDLP_PATH);
    if (!IS_WIN) {
      await fs.chmod(YTDLP_PATH, 0o755);
    }
    console.log("[peel] yt-dlp is ready.");
  })();

  try {
    await ytDlpSetupPromise;
  } finally {
    ytDlpSetupPromise = null;
  }
}

/* ═══════════ SECURITY HEADERS ═══════════ */

app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; form-action 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'"
  );
  next();
});

app.use(compression());

const ALLOWED_ORIGINS = new Set([
  "https://peelytmp3.com",
  "https://www.peelytmp3.com",
  "http://localhost:3000"
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "4kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests. Try again in a minute." },
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", apiLimiter);

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  })
);

/* ═══════════ VALIDATION ═══════════ */

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com"
]);

function isYoutubeUrl(value) {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return false;
    const host = parsed.hostname.replace(/^www\./, "");
    return YOUTUBE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/* ═══════════ TEMP CLEANUP ═══════════ */

async function cleanupStaleFiles() {
  try {
    const entries = await fs.readdir(TMP_DIR);
    const now = Date.now();
    await Promise.allSettled(
      entries.map(async (name) => {
        const filePath = path.join(TMP_DIR, name);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > STALE_FILE_MAX_AGE_MS) {
          await fs.unlink(filePath);
        }
      })
    );
  } catch {
    // TMP_DIR might not exist yet — that's fine.
  }
}

setInterval(cleanupStaleFiles, CLEANUP_INTERVAL_MS);
cleanupStaleFiles();

/* ═══════════ YT-DLP EXTRACTION ═══════════ */

function extractMp3(url) {
  return new Promise((resolve, reject) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const template = `peel-${stamp}-%(id)s.%(ext)s`;
    const ffmpegDir = path.dirname(ffmpegPath);

    const args = [
      "--ignore-config",
      "--no-playlist",
      "--no-warnings",
      "--no-update",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--ffmpeg-location", ffmpegDir,
      "--paths", TMP_DIR,
      "-o", template,
      "--print", "title",
      "--print", "after_move:filepath",
      url
    ];

    const child = spawn(YTDLP_PATH, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      reject(new Error("Extraction timed out."));
    }, YTDLP_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code !== 0) {
        reject(new Error(stderr?.split("\n")[0] || `yt-dlp exited with code ${code}`));
        return;
      }

      const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const title = lines.at(-2) || "youtube-audio";
      let filePath = lines.at(-1) || "";

      if (!filePath || !fsSync.existsSync(filePath)) {
        const fallback = fsSync
          .readdirSync(TMP_DIR)
          .find((n) => n.startsWith(`peel-${stamp}-`) && n.endsWith(".mp3"));
        filePath = fallback ? path.join(TMP_DIR, fallback) : "";
      }

      if (!filePath || !fsSync.existsSync(filePath)) {
        reject(new Error("Audio extraction produced no output file."));
        return;
      }

      resolve({ title, filePath });
    });
  });
}

async function safeUnlink(filePath) {
  try { await fs.unlink(filePath); } catch { /* noop */ }
}

/* ═══════════ ROUTE ═══════════ */

app.post("/api/download", async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A valid YouTube URL is required." });
  }

  if (!isYoutubeUrl(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL." });
  }

  if (activeJobs >= MAX_CONCURRENT) {
    return res.status(429).json({ error: "Server is busy. Try again in a moment." });
  }

  activeJobs++;
  let outputPath = "";

  try {
    await ensureYtDlpBinary();

    await fs.mkdir(TMP_DIR, { recursive: true });

    const { title, filePath } = await extractMp3(url);
    outputPath = filePath;

    const safeTitle = sanitizeFilename(title).trim() || "youtube-audio";
    const fileName = `${safeTitle}.mp3`;

    res.setHeader("Cache-Control", "no-store");
    res.download(outputPath, fileName, async (err) => {
      await safeUnlink(outputPath);
      if (err && !res.headersSent) {
        res.status(500).json({ error: "File transfer failed." });
      }
    });
  } catch (error) {
    if (outputPath) await safeUnlink(outputPath);
    console.error("[peel]", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process the video." });
    }
  } finally {
    activeJobs--;
  }
});

/* ═══════════ SPA FALLBACK ═══════════ */

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ═══════════ STARTUP ═══════════ */

const server = app.listen(PORT, () => {
  console.log(`[peel] listening on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`[peel] port ${PORT} already in use`);
    process.exit(1);
  }
  throw error;
});

/* ═══════════ GRACEFUL SHUTDOWN ═══════════ */

function shutdown() {
  console.log("[peel] shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  console.error("[peel] uncaught exception:", err);
  shutdown();
});
