
"use client";

import { useEffect, useRef } from "react";

const revealSelectors = [
  ".intro .section-kicker",
  ".intro-layout h2",
  ".intro-copy",
  ".visual-panel",
  ".capabilities .section-kicker",
  ".capabilities .section-title",
  ".service-row",
  ".manifesto .section-kicker",
  ".manifesto p",
  ".footer-top",
  ".footer h2",
  ".footer > p",
];

export default function SiteExperience() {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const progress = progressRef.current;
    const hero = document.querySelector<HTMLElement>(".hero");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    let scrollFrame = 0;
    let pointerFrame = 0;

    function updateProgress() {
      scrollFrame = 0;

      const scrollable =
        document.documentElement.scrollHeight -
        window.innerHeight;

      const value =
        scrollable > 0
          ? Math.max(
              0,
              Math.min(1, window.scrollY / scrollable)
            )
          : 0;

      if (progress) {
        progress.style.transform = `scaleX(${value})`;
      }
    }

    function requestProgressUpdate() {
      if (scrollFrame !== 0) return;

      scrollFrame = window.requestAnimationFrame(
        updateProgress
      );
    }

    function handlePointer(event: PointerEvent) {
      if (
        !hero ||
        reducedMotion.matches ||
        event.pointerType !== "mouse"
      ) {
        return;
      }

      if (pointerFrame !== 0) {
        window.cancelAnimationFrame(pointerFrame);
      }

      const rect = hero.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return;

      const x =
        ((event.clientX - rect.left) / rect.width) * 100;

      const y =
        ((event.clientY - rect.top) / rect.height) * 100;

      pointerFrame = window.requestAnimationFrame(() => {
        hero.style.setProperty(
          "--spot-x",
          `${Math.max(0, Math.min(100, x))}%`
        );

        hero.style.setProperty(
          "--spot-y",
          `${Math.max(0, Math.min(100, y))}%`
        );

        pointerFrame = 0;
      });
    }

    function resetPointer() {
      if (!hero) return;

      if (pointerFrame !== 0) {
        window.cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
      }

      hero.style.setProperty("--spot-x", "72%");
      hero.style.setProperty("--spot-y", "42%");
    }

    window.addEventListener(
      "scroll",
      requestProgressUpdate,
      { passive: true }
    );

    window.addEventListener(
      "resize",
      requestProgressUpdate
    );

    hero?.addEventListener(
      "pointermove",
      handlePointer,
      { passive: true }
    );

    hero?.addEventListener(
      "pointerleave",
      resetPointer
    );

    updateProgress();

    const targets =
      document.querySelectorAll<HTMLElement>(
        revealSelectors.join(",")
      );

    const animations: Animation[] = [];

    let observer: IntersectionObserver | null = null;

    if (
      !reducedMotion.matches &&
      "IntersectionObserver" in window
    ) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const element = entry.target as HTMLElement;

            const animation = element.animate(
              [
                {
                  opacity: 0.3,
                  transform: "translate3d(0, 28px, 0)",
                  filter: "blur(5px)",
                },
                {
                  opacity: 1,
                  transform: "translate3d(0, 0, 0)",
                  filter: "blur(0px)",
                },
              ],
              {
                duration: 850,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                iterations: 1,
              }
            );

            animations.push(animation);
            observer?.unobserve(element);
          }
        },
        {
          threshold: 0.12,
          rootMargin: "0px 0px -4% 0px",
        }
      );

      targets.forEach((element) => {
        observer?.observe(element);
      });
    }

    return () => {
      window.removeEventListener(
        "scroll",
        requestProgressUpdate
      );

      window.removeEventListener(
        "resize",
        requestProgressUpdate
      );

      hero?.removeEventListener(
        "pointermove",
        handlePointer
      );

      hero?.removeEventListener(
        "pointerleave",
        resetPointer
      );

      if (scrollFrame !== 0) {
        window.cancelAnimationFrame(scrollFrame);
      }

      if (pointerFrame !== 0) {
        window.cancelAnimationFrame(pointerFrame);
      }

      observer?.disconnect();

      animations.forEach((animation) => {
        animation.cancel();
      });
    };
  }, []);

  return (
    <div
      ref={progressRef}
      className="page-progress"
      aria-hidden="true"
    />
  );
}
