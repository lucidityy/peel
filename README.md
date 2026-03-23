# Peel — YouTube to MP3

Extract high-quality MP3 audio from YouTube videos. No signup, no ads.

## Run locally

```bash
npm install
npm start
```

Runs at `http://localhost:3000`.

## Deployment

**This app requires a Node.js runtime** (Express + yt-dlp + ffmpeg). It does **not** run as Vercel static or serverless:

- **Static Vercel** (`vercel.json`): frontend only. Point the client to your API URL via env.
- **Full app**: use [Railway](https://railway.app), [Render](https://render.com), [Fly.io](https://fly.io), or any host that runs `node server.js` with persistent storage for binaries.

`postinstall` downloads yt-dlp to `bin/`; the server uses it when present, otherwise fetches at runtime to `os.tmpdir()`.
