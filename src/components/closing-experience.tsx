
"use client";

import {
  motion,
  useReducedMotion,
} from "motion/react";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Check,
  MoveUp,
} from "lucide-react";

import styles from "./closing-experience.module.css";

const principles = [
  {
    number: "01",
    title: "ORIGINAL BY DESIGN.",
    description:
      "We want every experience to have its own identity, not look like another template.",
  },
  {
    number: "02",
    title: "FUNCTION OVER FICTION.",
    description:
      "Beautiful interfaces mean nothing if the software behind them doesn't work.",
  },
  {
    number: "03",
    title: "DETAIL IS EVERYTHING.",
    description:
      "The small interactions, the invisible engineering and the final polish all matter.",
  },
] as const;

export default function ClosingExperience() {
  const reducedMotion = useReducedMotion();

  const transitionDuration = reducedMotion ? 0 : 0.95;

  return (
    <>
      <section
        className={styles.manifesto}
        aria-labelledby="manifesto-heading"
      >
        <div className={styles.manifestoTop}>
          <span>03 / OUR PHILOSOPHY</span>

          <span className={styles.manifestoTopRight}>
            <Asterisk size={15} aria-hidden="true" />
            CREATIVE THINKING / REAL ENGINEERING
          </span>
        </div>

        <motion.div
          className={styles.statement}
          initial={
            reducedMotion
              ? false
              : { opacity: 0, y: 70 }
          }
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{
            duration: transitionDuration,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <span className={styles.statementLabel}>
            THE KUSH MINDSET
            <span className={styles.statementLine} />
          </span>

          <h2 id="manifesto-heading">
            LOOK
            <br />
            <span className={styles.outlineText}>
              DIFFERENT.
            </span>
            <br />
            WORK
            <br />
            <span className={styles.italicText}>
              BETTER.
            </span>
          </h2>
        </motion.div>

        <div className={styles.manifestoBottom}>
          <p>
            Our ambition is simple: make technology
            useful enough to matter and distinctive
            enough to remember.
          </p>

          <a
            href="#principles"
            className={styles.manifestoArrow}
            aria-label="Discover our principles"
          >
            <ArrowDownLeft size={28} strokeWidth={1.6} />
          </a>
        </div>

        <div className={styles.manifestoIndex} aria-hidden="true">
          K / 003
        </div>
      </section>

      <section
        className={styles.principles}
        id="principles"
        aria-labelledby="principles-heading"
      >
        <div className={styles.sectionMeta}>
          <span>THE THINGS WE BELIEVE IN</span>
          <span>KUSH STUDIO / 2026</span>
        </div>

        <div className={styles.principlesHeading}>
          <h2 id="principles-heading">
            BUILT ON
            <br />
            <span>PRINCIPLE.</span>
          </h2>

          <p>
            Not another list of buzzwords. These are
            the standards we're building KUSH around.
          </p>
        </div>

        <div className={styles.principleList}>
          {principles.map((principle, index) => (
            <motion.article
              key={principle.number}
              className={styles.principle}
              initial={
                reducedMotion
                  ? false
                  : { opacity: 0, y: 35 }
              }
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: reducedMotion ? 0 : 0.7,
                delay: reducedMotion ? 0 : index * 0.09,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <span className={styles.principleNumber}>
                / {principle.number}
              </span>

              <div className={styles.principleContent}>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </div>

              <Check
                className={styles.principleIcon}
                size={22}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </motion.article>
          ))}
        </div>

        <div className={styles.principlesEnd}>
          <span>
            DESIGN <b>✳</b> DEVELOPMENT <b>✳</b> DIRECTION
          </span>
          <ArrowRight size={21} aria-hidden="true" />
        </div>
      </section>

      <footer
        className={styles.footer}
        id="contact"
        aria-labelledby="footer-heading"
      >
        <div className={styles.footerTop}>
          <span>04 / WHAT'S NEXT</span>

          <span className={styles.status}>
            <span className={styles.statusDot} />
            KUSH IS IN DEVELOPMENT
          </span>
        </div>

        <div className={styles.footerMain}>
          <motion.div
            className={styles.footerTitleWrap}
            initial={
              reducedMotion
                ? false
                : { opacity: 0, y: 65 }
            }
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{
              duration: transitionDuration,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <span className={styles.footerEyebrow}>
              THE FUTURE IS UNDER CONSTRUCTION.
            </span>

            <h2 id="footer-heading">
              JUST THE
              <br />
              <span>BEGINNING.</span>
            </h2>

            <p className={styles.footerDescription}>
              We're building KUSH from the ground up:
              software, creative experiences and connected
              systems. The studio and its products are
              still taking shape.
            </p>
          </motion.div>

          <div className={styles.footerActions}>
            <a href="#work" className={styles.primaryLink}>
              EXPLORE OUR CAPABILITIES
              <ArrowUpRight size={21} aria-hidden="true" />
            </a>

            <a href="#studio" className={styles.secondaryLink}>
              BACK TO THE STUDIO
              <ArrowRight size={19} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className={styles.signatureArea}>
          <div className={styles.signatureMeta}>
            <span>INDEPENDENT CREATIVE TECHNOLOGY</span>
            <span>EST. 2026</span>
          </div>

          <div className={styles.signature} aria-label="KUSH">
            K<span>U</span>SH
            <sup>®</sup>
          </div>

          <div className={styles.signatureUnderline} />
        </div>

        <div className={styles.footerBottom}>
          <span>© 2026 KUSH. ALL RIGHTS RESERVED.</span>

          <span className={styles.footerBottomStatus}>
            BUILT DIFFERENT / IN PROGRESS
          </span>

          <a href="#top">
            BACK TO TOP
            <MoveUp size={16} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </>
  );
}
