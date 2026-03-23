# Peel — YouTube to MP3

Extract high-quality MP3 audio from YouTube videos. No signup, no ads.

## Run locally

```bash
npm install
npm start
```

Runs at `http://localhost:3000`.

## Deployment

**Full app** (Node + yt-dlp + ffmpeg) — use one of these:

| Platform | Action |
|----------|--------|
| **[Render](https://render.com)** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/lucidityy/peel) — Uses `render.yaml` + Dockerfile, free tier available |
| **[Railway](https://railway.app)** | Connect [GitHub repo](https://github.com/lucidityy/peel), add new project → Deploy from GitHub. Set root directory, use Dockerfile. |
| **[Fly.io](https://fly.io)** | `fly launch` then `fly deploy` (requires `flyctl` CLI) |

Code is pushed to `master`. Deploy requires interactive login (GitHub OAuth for Render/Railway).
