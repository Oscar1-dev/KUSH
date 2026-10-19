import Link from "next/link";

import styles from "@/components/account/account.module.css";
import { money } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff, roleLabel } from "@/lib/server/staff";

interface Stats {
  customers: number;
  orders: number;
  revenuePence: number;
  creditSpentPence: number;
  refundsPence: number;
  openQuotes: number;
  activeCommissions: number;
  completedCommissions: number;
  openTickets: number;
  qualifiedReferrals: number;
  flaggedReferrals: number;
  payments: "off" | "test" | "live";
}

export default async function StaffOverview() {
  const gate = await requireStaff();
  if (!gate) return null;
  const { me } = gate;
  const cards = [
    has(me, "tickets.assigned") && {
      href: "/staff/tickets?scope=assigned",
      label: "MY TICKETS",
      value: me.overview.assignedTickets,
      text: "Open tickets assigned to you.",
    },
    has(me, "tickets.queue") && {
      href: "/staff/tickets?scope=queue",
      label: "UNASSIGNED QUEUE",
      value: me.overview.queuedTickets,
      text: "Waiting for someone to claim them.",
    },
    has(me, "reports.handle") && {
      href: "/staff/tickets?scope=reports",
      label: "MEMBER REPORTS",
      value: me.overview.openReports,
      text: "Open moderation reports.",
    },
    has(me, "commissions.assigned") && {
      href: "/staff/commissions?scope=assigned",
      label: "MY COMMISSIONS",
      value: me.overview.activeCommissions,
      text: "Active commissions assigned to you.",
    },
  ].filter(Boolean) as { href: string; label: string; value: number; text: string }[];
  const stats = has(me, "stats.view") ? await kushApi<Stats>("/web/staff/stats", { token: gate.token }) : null;

  return (
    <>
      <p className={styles.kicker}>STAFF OVERVIEW</p>
      <h1 className={styles.title}>
        Operations <em>desk.</em>
      </h1>
      <p className={styles.lede}>
        Signed in as {me.roles.map((r) => roleLabel[r]).join(" + ")}. What you can see and do here comes from your
        current Discord roles, checked live on every page.
      </p>
      <div className={styles.grid}>
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className={styles.card}>
            <p className={styles.cardLabel}>{card.label}</p>
            <p className={styles.cardValue} style={{ fontSize: 44 }}>
              {card.value}
            </p>
            <p className={styles.cardText}>{card.text}</p>
          </Link>
        ))}
      </div>

      {stats ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>The business</h2>
          <p className={styles.rowMeta} style={{ marginBottom: 14 }}>
            Real records only. Revenue is money received (card and recorded offline payments) minus refunds. Card
            payments: {stats.payments === "off" ? "not connected" : stats.payments === "test" ? "Stripe test mode" : "live"}.
          </p>
          <div className={styles.grid}>
            {[
              { label: "REVENUE", value: money(stats.revenuePence), href: "/staff/orders?status=paid" },
              { label: "PAID ORDERS", value: String(stats.orders), href: "/staff/orders" },
              { label: "REFUNDED", value: money(stats.refundsPence), href: "/staff/orders?status=refunded" },
              { label: "ACTIVE COMMISSIONS", value: String(stats.activeCommissions), href: "/staff/commissions?scope=all" },
              { label: "OPEN QUOTES", value: String(stats.openQuotes), href: "/staff/commissions?scope=all" },
              { label: "DELIVERED", value: String(stats.completedCommissions), href: "/staff/commissions?scope=all" },
              { label: "OPEN TICKETS", value: String(stats.openTickets), href: "/staff/tickets?scope=all" },
              { label: "CUSTOMERS", value: String(stats.customers), href: "/staff/customers" },
              {
                label: "REFERRALS",
                value: String(stats.qualifiedReferrals),
                href: "/staff/referrals",
                text: stats.flaggedReferrals ? `${stats.flaggedReferrals} to review` : "qualified",
              },
            ].map((card) => (
              <Link key={card.label} href={card.href} className={styles.card}>
                <p className={styles.cardLabel}>{card.label}</p>
                <p className={styles.cardValue} style={{ fontSize: 34 }}>
                  {card.value}
                </p>
                {"text" in card ? <p className={styles.cardText}>{card.text}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
