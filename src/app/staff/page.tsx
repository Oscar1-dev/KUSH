import Link from "next/link";

import styles from "@/components/account/account.module.css";
import { has, requireStaff, roleLabel } from "@/lib/server/staff";

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
    </>
  );
}
