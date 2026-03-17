const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const BIN_DIR = path.join(__dirname, "..", "bin");
const IS_WIN = process.platform === "win32";
const FILENAME = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
const DEST = path.join(BIN_DIR, FILENAME);

const BASE_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
const DOWNLOAD_URL = BASE_URL + FILENAME;

if (fs.existsSync(DEST)) {
  console.log(`[postinstall] ${FILENAME} already exists, skipping.`);
  process.exit(0);
}

fs.mkdirSync(BIN_DIR, { recursive: true });

console.log(`[postinstall] Downloading ${FILENAME}...`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          if (!IS_WIN) {
            fs.chmodSync(dest, 0o755);
          }
          resolve();
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

download(DOWNLOAD_URL, DEST)
  .then(() => console.log(`[postinstall] ${FILENAME} downloaded to bin/`))
  .catch((err) => {
    console.error(`[postinstall] Failed to download ${FILENAME}:`, err.message);
    process.exit(1);
  });
