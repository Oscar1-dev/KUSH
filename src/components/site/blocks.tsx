import Link from "next/link";

import styles from "./site.module.css";

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;

export function Arrow({ size = 16, up = false }: { size?: number; up?: boolean }) {
  return (
    <svg className={styles.arrow} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {up ? (
        <path d="M4.5 11.5l7-7M5.5 4.5h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      ) : (
        <path d="M2.5 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      )}
    </svg>
  );
}

/** Standard hero for inner pages: label, two-line title, lede, actions. */
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
  aside,
}: {
  eyebrow: string;
  title: [string, string];
  lede?: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className={styles.pageHero}>
      <div className={`hex-mesh ${styles.pageHeroMesh}`} aria-hidden="true" />
      <div className={`container ${styles.pageHeroInner}`}>
        <div>
          <p className="eyebrow" data-intro>
            {eyebrow}
          </p>
          <h1 className={`display ${styles.pageTitle}`}>
            <span data-intro style={delay(1)}>
              {title[0]}
            </span>
            <span data-intro className={`holo ${styles.pageTitleAccent}`} style={delay(2)}>
              {title[1]}
            </span>
          </h1>
        </div>
        <div data-intro style={delay(3)}>
          {lede ? <p className={styles.lede}>{lede}</p> : null}
          {children ? <div className={styles.heroActions}>{children}</div> : null}
          {aside}
        </div>
      </div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionHead}>
      <div data-reveal>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className={`display ${styles.sectionTitle}`}>
          {title}
          {accent ? (
            <>
              {" "}
              <em className="holo">{accent}</em>
            </>
          ) : null}
        </h2>
      </div>
      {children ? (
        <div data-reveal style={delay(1)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Closing call to action used at the foot of most pages. */
export function Cta({
  title = ["Have something", "in mind?"],
  text = "Tell us about it. Requests are free, and every project starts with a quote you accept first.",
}: {
  title?: [string, string];
  text?: string;
}) {
  return (
    <section className={styles.cta}>
      <div className={`hex-mesh ${styles.ctaMesh}`} aria-hidden="true" />
      <div className={`container ${styles.ctaInner}`}>
        <h2 className={`display ${styles.ctaTitle}`} data-reveal>
          {title[0]}
          <br />
          <em className="holo">{title[1]}</em>
        </h2>
        <p className={styles.lede} data-reveal style={delay(1)}>
          {text}
        </p>
        <div className={styles.heroActions} data-reveal style={delay(2)}>
          <Link href="/commission" className={styles.button}>
            Start a project <Arrow />
          </Link>
          <Link href="/contact" className={styles.buttonGhost}>
            Ask a question
          </Link>
        </div>
      </div>
    </section>
  );
}
