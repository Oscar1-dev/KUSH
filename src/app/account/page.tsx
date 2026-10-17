import Link from "next/link";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

interface Summary {
  tickets: number;
  waiting: number;
  commissions: number;
  applications: number;
  products: number;
}

export default async function OverviewPage() {
  const { account, token } = await requireAccount();
  const name = account.displayName ?? "there";
  const [summary, feed] = await Promise.all([
    kushApi<Summary>("/web/account/summary", { token }).catch(() => null),
    kushApi<{ unread: number }>("/web/account/notifications", { token }).catch(() => null),
  ]);

  const cards = [
    {
      href: "/account/support",
      label: "SUPPORT",
      value: summary ? `${summary.tickets} open` : "Tickets",
      text: summary?.waiting ? `${summary.waiting} waiting for your reply.` : "Conversations with the KUSH team.",
      warn: Boolean(summary?.waiting),
    },
    {
      href: "/account/commissions",
      label: "COMMISSIONS",
      value: summary ? `${summary.commissions} active` : "Your projects",
      text: "Track enquiries, quotes and delivery.",
    },
    {
      href: "/account/notifications",
      label: "NOTIFICATIONS",
      value: feed ? (feed.unread ? `${feed.unread} new` : "All caught up") : "Updates",
      text: "Replies and status changes from KUSH.",
      warn: Boolean(feed?.unread),
    },
    {
      href: "/account/products",
      label: "MY PRODUCTS",
      value: summary ? `${summary.products} owned` : "Library",
      text: "Products and licences on your account.",
    },
  ];

  return (
    <>
      <p className={styles.kicker}>OVERVIEW</p>
      <h1 className={styles.title}>
        Hello, <em>{name}.</em>
      </h1>
      <p className={styles.lede}>
        Your KUSH account works across the website, the KUSH Discord and future KUSH apps. Member since{" "}
        {dateFormat.format(new Date(account.createdAt))}.
      </p>

      <div className={styles.grid}>
        <Link href="/account/security" className={styles.card}>
          <p className={styles.cardLabel}>SECURITY</p>
          <p className={styles.cardValue}>{account.mfa.enabled ? "2FA on" : "2FA off"}</p>
          <p className={styles.cardText}>
            {account.mfa.enabled
              ? `${account.mfa.recoveryCodesLeft} recovery codes left.`
              : "Add an authenticator app to protect your account."}
          </p>
          <span className={`${styles.badge} ${account.mfa.enabled ? styles.badgeOn : styles.badgeWarn}`} style={{ marginTop: 18 }}>
            {account.mfa.enabled ? "PROTECTED" : "RECOMMENDED"}
          </span>
        </Link>
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className={styles.card}>
            <p className={styles.cardLabel}>{card.label}</p>
            <p className={styles.cardValue}>{card.value}</p>
            <p className={styles.cardText}>{card.text}</p>
            {card.warn ? (
              <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginTop: 18 }}>
                NEEDS YOU
              </span>
            ) : null}
          </Link>
        ))}
        {summary?.applications ? (
          <Link href="/account/applications" className={styles.card}>
            <p className={styles.cardLabel}>STAFF APPLICATIONS</p>
            <p className={styles.cardValue}>{summary.applications} in progress</p>
            <p className={styles.cardText}>Track your application and onboarding.</p>
          </Link>
        ) : null}
        <Link href="/account/discord" className={styles.card}>
          <p className={styles.cardLabel}>DISCORD</p>
          <p className={styles.cardValue}>{account.discord ? `@${account.discord.username}` : "Not linked"}</p>
          <p className={styles.cardText}>Your server roles follow what you own on KUSH.</p>
        </Link>
      </div>
    </>
  );
}
