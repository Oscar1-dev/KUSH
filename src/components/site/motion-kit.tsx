"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";


/**
 * The site's motion engine, one rAF loop for everything:
 *  - Lenis smooth wheel scrolling (native scroll is kept on touch).
 *  - [data-scroll]: writes --p (0 entering at the bottom → 1 leaving at the
 *    top) and --c (−1..1 around the viewport centre) so CSS can drive
 *    parallax and scroll-linked effects declaratively.
 *  - --scroll-v on <html>: smoothed scroll velocity (marquees, skew).
 *  - --holo-x: pointer position for foil.
 *  - [data-pin]: writes --pin (0..1) through a tall section with a
 *    sticky child, for pinned scroll sequences.
 *  - [data-magnetic]: elements lean toward the cursor.
 * Reduced motion: none of it runs, the page is a normal static page.
 */
export default function MotionKit() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const fine = window.matchMedia("(pointer: fine)").matches;

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true });
    lenisRef.current = lenis;
    root.classList.add("motion");

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let velocity = 0;
    let frame = 0;
    let scrollables: HTMLElement[] = [];
    let magnets: HTMLElement[] = [];
    let pins: HTMLElement[] = [];
    const collect = () => {
      scrollables = Array.from(document.querySelectorAll<HTMLElement>("[data-scroll]"));
      magnets = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
      pins = Array.from(document.querySelectorAll<HTMLElement>("[data-pin]"));
    };
    collect();
    const mo = new MutationObserver(collect);
    mo.observe(document.body, { childList: true, subtree: true });

    lenis.on("scroll", (instance: Lenis) => {
      velocity = instance.velocity;
    });

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let smoothV = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      const vh = window.innerHeight;

      // Scroll-linked progress for every [data-scroll] element on screen.
      for (const el of scrollables) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) continue;
        const p = (vh - rect.top) / (vh + rect.height);
        const c = (rect.top + rect.height / 2 - vh / 2) / (vh / 2);
        el.style.setProperty("--p", Math.min(1, Math.max(0, p)).toFixed(4));
        el.style.setProperty("--c", Math.min(1.5, Math.max(-1.5, c)).toFixed(4));
      }
      // [data-pin]: progress through a tall section whose child is sticky.
      for (const el of pins) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) continue;
        const q = -rect.top / Math.max(1, rect.height - vh);
        el.style.setProperty("--pin", Math.min(1, Math.max(0, q)).toFixed(4));
      }

      smoothV += (velocity - smoothV) * 0.1;
      root.style.setProperty("--scroll-v", smoothV.toFixed(3));
      root.style.setProperty("--holo-x", `${Math.round(10 + (pointer.x / window.innerWidth) * 80)}%`);

      if (fine) {
        for (const el of magnets) {
          const rect = el.getBoundingClientRect();
          const dx = pointer.x - (rect.left + rect.width / 2);
          const dy = pointer.y - (rect.top + rect.height / 2);
          const reach = Math.max(rect.width, rect.height) * 1.1;
          const pull = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
          el.style.transform = pull ? `translate3d(${dx * pull * 0.28}px, ${dy * pull * 0.35}px, 0)` : "";
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // In-page anchors scroll smoothly too.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!link) return;
      const target = document.querySelector(link.getAttribute("href")!);
      if (target) {
        event.preventDefault();
        lenis.scrollTo(target as HTMLElement, { offset: -80 });
      }
    };
    document.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("click", onClick);
      lenis.destroy();
      lenisRef.current = null;
      root.classList.remove("motion");
    };
  }, []);

  // New page: start at the top.
  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
