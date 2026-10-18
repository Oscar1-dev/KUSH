"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * One observer for every [data-reveal] element on the page. Elements reveal
 * once as they enter the viewport. Re-runs on navigation; anything already
 * on screen (or if IntersectionObserver is missing) is shown immediately.
 */
export default function RevealController() {
  const pathname = usePathname();

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    items.forEach((item) => observer.observe(item));
    // Safety net: anything on or above the screen after a moment is shown,
    // even if an observer callback was missed (e.g. a backgrounded tab).
    const fallback = window.setInterval(() => {
      for (const item of items)
        if (!item.classList.contains("is-in") && item.getBoundingClientRect().top < window.innerHeight)
          item.classList.add("is-in");
    }, 1200);
    return () => {
      observer.disconnect();
      window.clearInterval(fallback);
    };
  }, [pathname]);

  return null;
}
