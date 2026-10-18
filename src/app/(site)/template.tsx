import styles from "@/components/site/effects.module.css";

/**
 * Re-mounts on every navigation, so each page arrives behind a short
 * curtain: the KUSH leaf, then a wipe upwards with a rainbow edge.
 * Pure CSS; skipped for reduced motion.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={styles.curtain} aria-hidden="true">
        <span className={styles.curtainLeaf} />
      </div>
      {children}
    </>
  );
}
