import Link from "next/link";
import { UserPlus } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { actionNeeded, applicationLabel, type ApplicationStatus } from "@/lib/recruitment";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface Row {
  id: string;
  number: number;
  status: ApplicationStatus;
  preferredName: string;
  positionTitle: string;
  updatedAt: string;
}

export default async function StaffApplications({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "applications.review")) return <p className={styles.lede}>Staff applications are for recruiters.</p>;
  const filter = (await searchParams).filter === "all" ? "all" : "open";
  const { applications } = await kushApi<{ applications: Row[] }>(`/web/staff/applications?filter=${filter}`, { token: gate.token });
  return (
    <>
      <p className={styles.kicker}>RECRUITMENT</p>
      <h1 className={styles.title}>
        Staff <em>applications.</em>
      </h1>
      <nav className={styles.formRow} aria-label="Filter" style={{ margin: "10px 0 26px" }}>
        {(["open", "all"] as const).map((f) => (
          <Link key={f} href={`/staff/applications?filter=${f}`} className={`${styles.button} ${f === filter ? styles.buttonPrimary : ""}`} aria-current={f === filter ? "page" : undefined}>
            {f === "open" ? "IN PROGRESS" : "ALL"}
          </Link>
        ))}
      </nav>
      {applications.length === 0 ? (
        <div className={styles.empty}>
          <UserPlus size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No applications</p>
          <p className={styles.emptyText}>New applications from the careers page appear here and in #staff-chat.</p>
        </div>
      ) : (
        applications.map((a) => (
          <Link key={a.id} href={`/staff/applications/${a.id}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                #{a.number} · {a.preferredName} · {a.positionTitle}
              </p>
              <p className={styles.rowMeta}>Updated {dateTime.format(new Date(a.updatedAt))}</p>
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
