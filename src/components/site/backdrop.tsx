"use client";

import { useEffect, useRef } from "react";

import styles from "./motion.module.css";

// KUSH holo colours as RGB, for tinting dots near the pointer.
const holo = [
  [255, 158, 219],
  [185, 162, 255],
  [143, 211, 255],
  [150, 242, 200],
  [255, 240, 154],
];

/**
 * Page-wide living backdrop: the hex lattice from the KUSH logo as a dot
 * field. A slow wave rolls through it, it drifts with scroll (parallax), and
 * dots near the cursor light up in the KUSH rainbow and lean away. Pauses in
 * background tabs; reduced motion gets one still frame.
 */
export default function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let step = 30;
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, a: 0, target: 0 };
    let frame = 0;

    const layout = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = width < 640 ? 24 : 30;
      if (still) draw(0);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      pointer.x += (pointer.tx - pointer.x) * 0.1;
      pointer.y += (pointer.ty - pointer.y) * 0.1;
      pointer.a += (pointer.target - pointer.a) * 0.05;
      const t = time / 1000;
      const rowH = step * 0.866;
      // Lattice drifts at a fraction of scroll speed: depth.
      const drift = (window.scrollY * 0.18) % (rowH * 2);
      const radius = Math.min(300, Math.max(170, width * 0.2));
      const hue = (t * 0.08) % 1;
      for (let row = -2, y = -drift - rowH * 2; y < height + rowH; row++, y += rowH) {
        for (let x = row % 2 ? step / 2 : 0; x < width + step; x += step) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy);
          const near = Math.max(0, 1 - dist / radius) * pointer.a;
          const wave = still ? 0.4 : 0.5 + 0.5 * Math.sin(x * 0.011 + y * 0.016 - t * 0.8);
          const push = near * near * 12;
          const px = x + (dist ? (dx / dist) * push : 0);
          const py = y + (dist ? (dy / dist) * push : 0);
          const size = 0.65 + wave * 0.45 + near * 1.6;
          if (near > 0.03) {
            // Colour depends on angle around the cursor + time: a rainbow halo.
            const k = ((Math.atan2(dy, dx) / (Math.PI * 2) + 0.5 + hue) % 1) * holo.length;
            const c0 = holo[Math.floor(k) % holo.length]!;
            const c1 = holo[(Math.floor(k) + 1) % holo.length]!;
            const f = k % 1;
            const r = c0[0]! + (c1[0]! - c0[0]!) * f;
            const g = c0[1]! + (c1[1]! - c0[1]!) * f;
            const b = c0[2]! + (c1[2]! - c0[2]!) * f;
            ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.15 + near * 0.75})`;
          } else {
            ctx.fillStyle = `rgba(243, 242, 239, ${0.035 + wave * 0.07})`;
          }
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (!still && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      if (pointer.x < -1000) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
      pointer.target = 1;
    };
    const onLeave = () => (pointer.target = 0);
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start());

    layout();
    start();
    window.addEventListener("resize", layout);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", layout);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className={styles.backdrop} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
    </>
  );
}
