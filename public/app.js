"use strict";

/* ═══════════ SCROLL REVEALS ═══════════ */

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

/* ═══════════ PARTICLES ═══════════ */

(function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let w, h, dots;
  let raf = 0;

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function seed() {
    const count = Math.min(Math.floor((w * h) / 20000), 120);
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      dx: (Math.random() - 0.5) * 0.2,
      dy: (Math.random() - 0.5) * 0.2,
      o: Math.random() * 0.3 + 0.05
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.x += d.dx;
      d.y += d.dy;
      if (d.x < 0) d.x = w;
      else if (d.x > w) d.x = 0;
      if (d.y < 0) d.y = h;
      else if (d.y > h) d.y = 0;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 6.2832);
      ctx.fillStyle = `rgba(123,147,255,${d.o})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  if (prefersReduced) return;

  resize();
  seed();
  draw();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      seed();
    }, 200);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      draw();
    }
  });
})();

/* ═══════════ DOWNLOAD LOGIC ═══════════ */

const form = document.getElementById("download-form");
const input = document.getElementById("youtube-url");
const statusEl = document.getElementById("status");
const statusMsg = statusEl.querySelector(".status-msg");
const button = document.getElementById("download-btn");
const btnText = button.querySelector(".btn-text");

const YOUTUBE_RE =
  /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)\//;
const FETCH_TIMEOUT_MS = 180_000;

let busy = false;

function setStatus(message, type = "idle") {
  statusMsg.textContent = message;
  statusEl.className = `status status--${type}`;
}

function setLoading(on) {
  busy = on;
  button.disabled = on;
  button.classList.toggle("loading", on);
  btnText.textContent = on ? "Peeling..." : "Peel Audio";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const url = input.value.trim();

  if (!url) {
    setStatus("Paste a YouTube URL first.", "error");
    input.focus();
    return;
  }

  if (!YOUTUBE_RE.test(url)) {
    setStatus("That doesn't look like a YouTube link.", "error");
    input.focus();
    return;
  }

  if (url.length > 2048) {
    setStatus("URL is too long.", "error");
    return;
  }

  setLoading(true);
  setStatus("Extracting audio — hang tight...", "loading");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    if (!res.ok) {
      let msg = "Download failed.";
      try {
        const json = await res.json();
        if (json?.error) msg = json.error;
      } catch {
        /* response wasn't JSON */
      }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download =
      res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
      "download.mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    setStatus("Done — redirecting...", "ok");
    setTimeout(() => { window.location.href = "/success.html"; }, 800);
  } catch (err) {
    if (err.name === "AbortError") {
      setStatus("Request timed out. Try again.", "error");
    } else {
      setStatus(err.message || "Something went wrong.", "error");
    }
  } finally {
    clearTimeout(timeout);
    setLoading(false);
  }
});
