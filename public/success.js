"use strict";

(function confetti() {
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener("resize", resize);

  const COLORS = ["#7b93ff", "#00e0ff", "#a855f7", "#34d399", "#f87171", "#facc15"];
  const COUNT = 80;
  const pieces = Array.from({ length: COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * -h,
    w: Math.random() * 8 + 4,
    h: Math.random() * 4 + 2,
    rot: Math.random() * 360,
    dx: (Math.random() - 0.5) * 2,
    dy: Math.random() * 3 + 2,
    dr: (Math.random() - 0.5) * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    opacity: 1
  }));

  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, w, h);
    let alive = false;

    for (const p of pieces) {
      if (p.opacity <= 0) continue;
      alive = true;
      p.x += p.dx;
      p.y += p.dy;
      p.rot += p.dr;
      if (p.y > h * 0.85) p.opacity -= 0.02;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    frame++;
    if (alive && frame < 300) {
      requestAnimationFrame(draw);
    }
  }

  draw();
})();
