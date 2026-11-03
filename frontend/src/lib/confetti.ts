/**
 * A one-shot confetti burst on a throwaway full-screen canvas (no library).
 * Removes itself when done; does nothing for users who prefer reduced motion.
 */
const COLORS = ["#d4a017", "#f3d98b", "#f08a24", "#3b5bdb", "#e64980", "#12b886"];

export function fireConfetti(origin: { x: number; y: number } = { x: 0.5, y: 0.3 }, count = 140, colors: string[] = COLORS) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  const ox = origin.x * window.innerWidth;
  const oy = origin.y * window.innerHeight;
  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 6 + Math.random() * 9;
    return {
      x: ox, y: oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 5, h: 8 + Math.random() * 6,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });

  const DURATION = 2600;
  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const fade = t > DURATION - 600 ? Math.max(0, (DURATION - t) / 600) : 1;
    for (const p of parts) {
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** A one-shot full-screen snowfall (~4.5s) — the Christmas card's burst. */
export function fireSnow(count = 160) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  const dark = document.documentElement.classList.contains("dark");
  const color = dark ? "255,255,255" : "160,182,220";
  const W = window.innerWidth, H = window.innerHeight;
  const flakes = Array.from({ length: count }, () => ({
    x: Math.random() * W, y: -Math.random() * H * 0.6,
    r: 1.2 + Math.random() * 2.8, vy: 1.2 + Math.random() * 1.8,
    phase: Math.random() * Math.PI * 2, drift: 0.5 + Math.random(),
  }));
  const DURATION = 4500;
  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    const fade = t > DURATION - 900 ? Math.max(0, (DURATION - t) / 900) : 1;
    ctx.fillStyle = `rgba(${color},${0.85 * fade})`;
    for (const f of flakes) {
      f.y += f.vy; f.phase += 0.03; f.x += Math.sin(f.phase) * f.drift;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** A one-shot fireworks show (~6s): rockets rise from the bottom and burst
 *  into falling sparks — New Year's Eve at midnight. */
export function fireFireworks(rockets = 9) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  const PALETTE = ["#ffd772", "#fff3c4", "#ff6b6b", "#7aa2ff", "#7fe0a3", "#f7a65a"];
  type Rocket = { x: number; y: number; vy: number; burstY: number; at: number; color: string; done: boolean };
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
  const list: Rocket[] = Array.from({ length: rockets }, (_, i) => ({
    x: W * (0.15 + Math.random() * 0.7), y: H + 10, vy: -(9 + Math.random() * 3),
    burstY: H * (0.15 + Math.random() * 0.3), at: i * 450 + Math.random() * 250,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)], done: false,
  }));
  const sparks: Spark[] = [];
  const DURATION = rockets * 450 + 2600;
  const start = performance.now();
  let last = start;

  const frame = (now: number) => {
    const t = now - start;
    const k = Math.min(now - last, 100) / 16.667;
    last = now;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.28)";          // trails fade out
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const r of list) {
      if (r.done || t < r.at) continue;
      r.y += r.vy * k;
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x - 1, r.y, 2, 6);
      if (r.y <= r.burstY) {
        r.done = true;
        const n = 60 + Math.floor(Math.random() * 30);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, sp = 2 + Math.random() * 3.5;
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: Math.random() < 0.25 ? "#fff6d8" : r.color });
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.vx *= Math.pow(0.97, k); p.vy = p.vy * Math.pow(0.97, k) + 0.06 * k;
      p.x += p.vx * k; p.y += p.vy * k; p.life -= 0.012 * k;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (t < DURATION || sparks.length) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
