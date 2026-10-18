import { Fragment } from "react";

import styles from "./effects.module.css";

/**
 * Splits a heading into words that slide up out of a mask, one after
 * another, when the nearest [data-reveal] ancestor comes into view.
 * Screen readers get the plain sentence.
 */
export default function SplitText({
  text,
  offset = 0,
  className,
  wordClassName = "",
}: {
  text: string;
  offset?: number;
  className?: string;
  /** Applied to each word (e.g. holo foil, which must sit on the moving element). */
  wordClassName?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={i}>
            <span className={styles.wordMask}>
              <span className={`${styles.word} ${wordClassName}`} style={{ "--w": i + offset } as React.CSSProperties}>
                {word}
              </span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
