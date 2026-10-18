"use client";

import { useEffect } from "react";

/**
 * Lets holographic foil catch the light: pointer position (or scroll on
 * touch devices) shifts the gradient a little. One rAF-throttled listener;
 * skipped entirely for reduced motion.
 */
export default function FoilTracker() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const set = (ratio: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => root.style.setProperty("--holo-x", `${Math.round(10 + ratio * 80)}%`));
    };
    const onPointer = (event: PointerEvent) => event.pointerType === "mouse" && set(event.clientX / window.innerWidth);
    const onScroll = () => set((window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) % 1);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      root.style.removeProperty("--holo-x");
    };
  }, []);
  return null;
}
