import Link from "next/link";

import Scramble from "./scramble";
import styles from "./site.module.css";
import SplitText from "./split-text";

const delay = (i: number) => ({ "--reveal-i": i }) as React.CSSProperties;

export { Arrow } from "./arrow";
import { Arrow } from "./arrow";

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
  const count = title.split(" ").length;
  return (
    <div className={styles.sectionHead}>
      <div data-reveal>
        <Scramble className="eyebrow" text={eyebrow} />
        <h2 className={`display ${styles.sectionTitle}`}>
          <SplitText text={title} />
          {accent ? (
            <>
              {" "}
              <em>
                <SplitText text={accent} offset={count} wordClassName="holo" />
              </em>
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
  text = "Tell us what you're thinking. Asking costs nothing, and you'll get a proper quote before anything starts.",
}: {
  title?: [string, string];
  text?: string;
}) {
  return (
    <section className={styles.cta}>
      <div className={`hex-mesh ${styles.ctaMesh}`} aria-hidden="true" />
      <div className={`container ${styles.ctaInner}`}>
        <h2 className={`display ${styles.ctaTitle}`} data-reveal>
          <SplitText text={title[0]} />
          <br />
          <em>
            <SplitText text={title[1]} offset={title[0].split(" ").length} wordClassName="holo" />
          </em>
        </h2>
        <p className={styles.lede} data-reveal style={delay(1)}>
          {text}
        </p>
        <div className={styles.heroActions} data-reveal style={delay(2)}>
          <Link href="/commission" className={styles.button} data-magnetic>
            Start a project <Arrow />
          </Link>
          <Link href="/contact" className={styles.buttonGhost} data-magnetic>
            Ask us something
          </Link>
        </div>
      </div>
    </section>
  );
}
