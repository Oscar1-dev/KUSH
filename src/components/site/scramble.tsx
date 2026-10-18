"use client";

import { useEffect, useRef } from "react";

const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/—*+";

/**
 * Mono label that decodes itself from random glyphs the first time it
 * scrolls into view. The real text is always in the DOM for assistive tech.
 */
export default function Scramble({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let settle = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const duration = 700 + text.length * 18;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const settled = Math.floor(t * text.length);
        el.textContent = text
          .split("")
          .map((char, i) => (i < settled || char === " " ? char : glyphs[(Math.random() * glyphs.length) | 0]))
          .join("");
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      // Always land on the real text, even if frames are throttled.
      settle = window.setTimeout(() => {
        cancelAnimationFrame(frame);
        el.textContent = text;
      }, duration + 250);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [text]);

  return (
    <span className={className} aria-label={text}>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
