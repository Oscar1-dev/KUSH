
"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";

import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

import KushMark from "./kush-mark";
import StudioShowcase from "./studio-showcase";
import ClosingExperience from "./closing-experience";

export default function InteractiveHero() {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();

  const heroY = useTransform(
    scrollYProgress,
    [0, 0.45],
    [0, reducedMotion ? 0 : 120]
  );

  return (
    <main className="site-shell">
      <div className="noise" aria-hidden="true" />

      <header className="nav-wrap">
        <a
          href="#top"
          className="wordmark"
          aria-label="KUSH home"
        >
          K<span>U</span>SH
          <span className="wordmark-dot">®</span>
        </a>

        <nav
          className="desktop-nav"
          aria-label="Primary navigation"
        >
          <a href="#studio">STUDIO</a>
          <a href="#work">CAPABILITIES</a>
          <a href="#contact">STATUS</a>
        </nav>

        <a className="nav-cta" href="#studio">
          EXPLORE KUSH
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>

      <section
        className="hero"
        id="top"
        aria-labelledby="hero-title"
      >
        <KushMark />

        <motion.div
          className="hero-content"
          style={{ y: heroY }}
        >
          <div className="eyebrow">
            <span className="live-dot" />
            INDEPENDENT DIGITAL STUDIO
            <span className="eyebrow-line" />
            EST. 2026
          </div>

          <h1 id="hero-title" className="hero-title">
            <span className="title-line">
              BUILT
            </span>

            <span className="title-line title-second">
              DIFFERENT
              <span className="period">.</span>
            </span>
          </h1>

          <div className="hero-bottom">
            <p>
              Software with substance.
              <br />
              Experiences with <em>attitude.</em>
              <br />
              Ideas without limits.
            </p>

            <a
              href="#studio"
              className="circle-link"
              aria-label="Explore the KUSH studio"
            >
              <ArrowDownRight
                size={32}
                aria-hidden="true"
              />
            </a>
          </div>
        </motion.div>

        <div className="hero-side-note">
          DESIGN / CODE / CULTURE
          <span> — </span>
          001
        </div>

        <div className="hero-bottom-rule">
          <span>SCROLL TO EXPLORE</span>
          <span>© KUSH 2026</span>
        </div>
      </section>

      <div
        className="ticker"
        aria-label="Software, design, systems and culture"
      >
        <div className="ticker-track" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index}>
              SOFTWARE <b>✳</b> DESIGN <b>✳</b>{" "}
              SYSTEMS <b>✳</b> CULTURE <b>✳</b>{" "}
            </span>
          ))}
        </div>
      </div>

      <StudioShowcase />

      <ClosingExperience />
    </main>
  );
}
