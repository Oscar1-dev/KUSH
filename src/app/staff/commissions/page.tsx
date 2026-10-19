import Link from "next/link";
import { PenTool } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { categoryLabel,  commissionLabel, dateTime, type CommissionStatus } from "@/lib/workspace";

interface Row {
  id: string;
  title: string;
  category: string;
  status: CommissionStatus;
  updatedAt: string;
  customerName: string;
  assigneeName: string | null;
}

export default async function StaffCommissions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const gate = await requireStaff();
  if (!gate) return null;
  const tabs = [
    ...(has(gate.me, "commissions.assigned") ? [{ scope: "assigned", label: "Mine" }] : []),
    ...(has(gate.me, "commissions.all") ? [{ scope: "all", label: "All commissions" }] : []),
  ];
  if (!tabs.length) return <p className={styles.lede}>Your roles don&apos;t include commission work.</p>;
  const requested = (await searchParams).scope;
  const scope = tabs.find((t) => t.scope === requested)?.scope ?? tabs[0]!.scope;
  const { commissions } = await kushApi<{ commissions: Row[] }>(`/web/staff/commissions?scope=${scope}`, { token: gate.token });

  return (
    <>
      <p className={styles.kicker}>COMMISSIONS</p>
      <h1 className={styles.title}>
        Client <em>work.</em>
      </h1>
      <nav className={styles.formRow} aria-label="Commission views" style={{ margin: "10px 0 26px" }}>
        {tabs.map((t) => (
          <Link
            key={t.scope}
            href={`/staff/commissions?scope=${t.scope}`}
            className={`${styles.button} ${t.scope === scope ? styles.buttonPrimary : ""}`}
            aria-current={t.scope === scope ? "page" : undefined}
          >
            {t.label.toUpperCase()}
          </Link>
        ))}
      </nav>
      {commissions.length === 0 ? (
        <div className={styles.empty}>
          <PenTool size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No commissions in this view</p>
        </div>
      ) : (
        commissions.map((c) => (
          <Link key={c.id} href={`/staff/commissions/${c.id}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>{c.title}</p>
              <p className={styles.rowMeta}>
                {c.customerName} · {categoryLabel(c.category)} · updated {dateTime.format(new Date(c.updatedAt))} ·{" "}
                {c.assigneeName ? `with ${c.assigneeName}` : "unassigned"}
              </p>
            </div>
            <span className={styles.badge}>{commissionLabel[c.status].toUpperCase()}</span>
          </Link>
        ))
      )}
    </>
  );
}
