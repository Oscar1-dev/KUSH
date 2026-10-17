import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { actionNeeded, applicationLabel, type Application } from "@/lib/recruitment";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateOnly } from "@/lib/workspace";

export default async function ApplicationsPage() {
  const { token } = await requireAccount();
  const { applications } = await kushApi<{ applications: Application[] }>("/web/recruitment/applications", { token });
  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.kicker}>STAFF APPLICATIONS</p>
          <h1 className={styles.title}>
            Join <em>KUSH.</em>
          </h1>
        </div>
        <Link href="/careers" className={`${styles.button} ${styles.buttonPrimary}`} style={{ marginBottom: 14 }}>
          SEE OPEN POSITIONS
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <p className={styles.lede}>Track your applications, talk to the recruitment team and sign your onboarding documents.</p>
      {applications.length === 0 ? (
        <div className={styles.empty}>
          <BadgeCheck size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No applications yet</p>
          <p className={styles.emptyText}>Browse open positions and apply with your KUSH account.</p>
        </div>
      ) : (
        applications.map((a) => (
          <Link key={a.id} href={`/account/applications/${a.id}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {a.positionTitle} · #{a.number}
              </p>
              <p className={styles.rowMeta}>Applied {dateOnly.format(new Date(a.createdAt))}</p>
            </div>
            <span className={`${styles.badge} ${actionNeeded(a.status) ? styles.badgeWarn : a.status === "activated" ? styles.badgeOn : ""}`}>
              {applicationLabel[a.status].toUpperCase()}
            </span>
          </Link>
        ))
      )}
    </>
  );
}
