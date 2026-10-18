import styles from "./site.module.css";

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
