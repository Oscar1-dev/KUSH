import type { LucideIcon } from "lucide-react";

import styles from "./account.module.css";

/** Honest empty state. Never shows invented records. */
export function EmptySection({
  kicker,
  title,
  accent,
  lede,
  icon: Icon,
  emptyTitle,
  emptyText,
}: {
  kicker: string;
  title: string;
  accent: string;
  lede: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <>
      <p className={styles.kicker}>{kicker}</p>
      <h1 className={styles.title}>
        {title} <em>{accent}</em>
      </h1>
      <p className={styles.lede}>{lede}</p>
      <div className={styles.empty}>
        <Icon size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
        <p className={styles.emptyTitle}>{emptyTitle}</p>
        <p className={styles.emptyText}>{emptyText}</p>
      </div>
    </>
  );
}
