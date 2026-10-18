import styles from "./site.module.css";

/**
 * The official KUSH wordmark (cut from the logo), filled with holographic
 * foil through a mask so it can catch the light. Aspect ratio 3.19 : 1.
 */
export default function Wordmark({ height = 26, live = false }: { height?: number; live?: boolean }) {
  return (
    <span
      className={`${styles.wordmark} ${live ? styles.wordmarkLive : ""}`}
      style={{ height, width: Math.round(height * 3.19) }}
      role="img"
      aria-label="KUSH"
    />
  );
}
