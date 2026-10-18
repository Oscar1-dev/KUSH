"use client";

import { useEffect, useRef } from "react";

import styles from "./effects.module.css";

/**
 * Giant kinetic band. Drifts on its own, speeds up with scroll velocity and
 * reverses when you scroll back up. The leaf from the KUSH mark separates
 * the words. Reduced motion: a still band.
 */
export default function Marquee({ words, reverse = false }: { words: string[]; reverse?: boolean }) {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = 0;
    let last = window.scrollY;
    let boost = 0;
    let direction = reverse ? 1 : -1;
    let frame = 0;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = Boolean(entry?.isIntersecting)));
    io.observe(el);
    const loop = () => {
      const y = window.scrollY;
      const delta = y - last;
      last = y;
      if (delta) direction = (delta > 0 ? -1 : 1) * (reverse ? -1 : 1);
      boost += (Math.min(40, Math.abs(delta)) - boost) * 0.08;
      if (visible) {
        const half = el.scrollWidth / 2;
        x += direction * (0.6 + boost * 0.35);
        if (x <= -half) x += half;
        if (x > 0) x -= half;
        el.style.transform = `translate3d(${x}px, 0, 0) skewX(${(-direction * boost * 0.25).toFixed(2)}deg)`;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [reverse]);

  const run = (key: string) =>
    words.map((word, i) => (
      <span key={`${key}${i}`} className={styles.marqueeItem}>
        <span className={i % 2 ? styles.marqueeOutline : "rainbow"}>{word}</span>
        <span className={styles.marqueeLeaf} />
      </span>
    ));

  return (
    <div className={styles.marquee} aria-hidden="true">
      <div ref={track} className={styles.marqueeTrack}>
        {run("a")}
        {run("b")}
      </div>
    </div>
  );
}
