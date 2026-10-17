import Link from "next/link";
import { Inbox } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff, type Permission } from "@/lib/server/staff";
import { dateTime, ticketLabel, type TicketStatus } from "@/lib/workspace";

interface StaffTicketRow {
  id: string;
  number: number;
  category: string;
  status: TicketStatus;
  priority: string;
  description: string;
  updatedAt: string;
  customerName: string;
  assigneeName: string | null;
}

const tabs: { scope: string; label: string; permission: Permission }[] = [
  { scope: "assigned", label: "Mine", permission: "tickets.assigned" },
  { scope: "queue", label: "Unassigned", permission: "tickets.queue" },
  { scope: "all", label: "All tickets", permission: "tickets.all" },
  { scope: "reports", label: "Member reports", permission: "reports.handle" },
];

export default async function StaffTickets({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const gate = await requireStaff();
  if (!gate) return null;
  const allowed = tabs.filter((tab) => has(gate.me, tab.permission));
  if (allowed.length === 0) return <p className={styles.lede}>Your roles don&apos;t include ticket work.</p>;
  const requested = (await searchParams).scope;
  const scope = allowed.find((tab) => tab.scope === requested)?.scope ?? allowed[0]!.scope;
  const { tickets } = await kushApi<{ tickets: StaffTicketRow[] }>(`/web/staff/tickets?scope=${scope}`, {
    token: gate.token,
  });

  return (
    <>
      <p className={styles.kicker}>{scope === "reports" ? "MODERATION" : "SUPPORT"}</p>
      <h1 className={styles.title}>
        {scope === "reports" ? "Member" : "Support"} <em>{scope === "reports" ? "reports." : "tickets."}</em>
      </h1>
      <nav className={styles.formRow} aria-label="Ticket views" style={{ margin: "10px 0 26px" }}>
        {allowed.map((tab) => (
          <Link
            key={tab.scope}
            href={`/staff/tickets?scope=${tab.scope}`}
            className={`${styles.button} ${tab.scope === scope ? styles.buttonPrimary : ""}`}
            aria-current={tab.scope === scope ? "page" : undefined}
          >
            {tab.label.toUpperCase()}
          </Link>
        ))}
      </nav>

      {tickets.length === 0 ? (
        <div className={styles.empty}>
          <Inbox size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>Nothing here</p>
          <p className={styles.emptyText}>
            {scope === "queue" ? "No unassigned tickets. Nice." : "No tickets in this view."}
          </p>
        </div>
      ) : (
        tickets.map((t) => (
          <Link key={t.id} href={`/staff/tickets/${t.id}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                #{t.number} · {t.category} · {t.customerName}
                {t.priority !== "normal" ? ` · ${t.priority.toUpperCase()}` : ""}
              </p>
              <p
                className={styles.rowMeta}
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }}
              >
                {t.description}
              </p>
              <p className={styles.rowMeta}>
                Updated {dateTime.format(new Date(t.updatedAt))} · {t.assigneeName ? `with ${t.assigneeName}` : "unassigned"}
              </p>
            </div>
            <span className={`${styles.badge} ${t.status === "waiting_for_customer" ? styles.badgeWarn : ""}`}>
              {ticketLabel[t.status].toUpperCase()}
            </span>
          </Link>
        ))
      )}
    </>
  );
}
