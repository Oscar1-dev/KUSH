import Link from "next/link";
import { ArrowUpRight, PenTool } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { categoryLabel,  commissionLabel, dateOnly, needsYou, type Commission } from "@/lib/workspace";

export default async function CommissionsPage() {
  const { token } = await requireAccount();
  const { commissions } = await kushApi<{ commissions: Commission[] }>("/web/workspace/commissions", { token });

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.kicker}>MY COMMISSIONS</p>
          <h1 className={styles.title}>
            Your <em>projects.</em>
          </h1>
        </div>
        <Link href="/account/commissions/new" className={`${styles.button} ${styles.buttonPrimary}`} style={{ marginBottom: 14 }}>
          START A COMMISSION
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <p className={styles.lede}>
        Website, software and creative commissions with KUSH, from first enquiry to delivery.
      </p>

      {commissions.length === 0 ? (
        <div className={styles.empty}>
          <PenTool size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No commissions yet</p>
          <p className={styles.emptyText}>
            Tell us what you want built. It&apos;s an enquiry, not an order: the team reviews it and sends a quote first.
          </p>
        </div>
      ) : (
        commissions.map((c) => (
          <Link key={c.id} href={`/account/commissions/${c.id}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>{c.title}</p>
              <p className={styles.rowMeta}>
                {categoryLabel(c.category)} · started {dateOnly.format(new Date(c.createdAt))}
              </p>
            </div>
            <span
              className={`${styles.badge} ${needsYou(c.status) ? styles.badgeWarn : c.status === "completed" ? styles.badgeOn : ""}`}
            >
              {commissionLabel[c.status].toUpperCase()}
            </span>
          </Link>
        ))
      )}
    </>
  );
}
