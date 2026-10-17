import Link from "next/link";
import { ArrowUpRight, LifeBuoy } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime, needsYou, ticketLabel, type Ticket } from "@/lib/workspace";

export default async function SupportPage() {
  const { token } = await requireAccount();
  const [{ tickets }, { categories }] = await Promise.all([
    kushApi<{ tickets: Ticket[] }>("/web/workspace/tickets", { token }),
    kushApi<{ categories: { key: string; label: string }[] }>("/web/workspace/ticket-categories", { token }),
  ]);
  const label = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const open = tickets.filter((t) => t.status !== "closed");
  const closed = tickets.filter((t) => t.status === "closed");

  const row = (t: Ticket) => (
    <Link key={t.id} href={`/account/support/${t.id}`} className={styles.listLink}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>
          #{t.number} · {label(t.category)}
        </p>
        <p className={styles.rowMeta} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>
          {t.description}
        </p>
        <p className={styles.rowMeta}>Updated {dateTime.format(new Date(t.updatedAt))}</p>
      </div>
      <span className={`${styles.badge} ${needsYou(t.status) ? styles.badgeWarn : t.status === "resolved" ? styles.badgeOn : ""}`}>
        {ticketLabel[t.status].toUpperCase()}
      </span>
    </Link>
  );

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.kicker}>SUPPORT TICKETS</p>
          <h1 className={styles.title}>
            Talk to <em>the team.</em>
          </h1>
        </div>
        <Link href="/account/support/new" className={`${styles.button} ${styles.buttonPrimary}`} style={{ marginBottom: 14 }}>
          OPEN A TICKET
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <p className={styles.lede}>
        Tickets you open here or in the KUSH Discord are the same: reply from either place.
      </p>

      {tickets.length === 0 ? (
        <div className={styles.empty}>
          <LifeBuoy size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No tickets</p>
          <p className={styles.emptyText}>Need help with something? Open a ticket and the team will reply here.</p>
        </div>
      ) : (
        <>
          {open.map(row)}
          {closed.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Closed</h2>
              {closed.map(row)}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
