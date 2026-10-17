import Link from "next/link";

import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

export default async function OverviewPage() {
  const { account } = await requireAccount();
  const name = account.displayName ?? "there";

  return (
    <>
      <p className={styles.kicker}>OVERVIEW</p>
      <h1 className={styles.title}>
        Hello, <em>{name}.</em>
      </h1>
      <p className={styles.lede}>
        Your KUSH account works across the website, the KUSH Discord and
        future KUSH apps. Member since {dateFormat.format(new Date(account.createdAt))}.
      </p>

      <div className={styles.grid}>
        <Link href="/account/security" className={styles.card}>
          <p className={styles.cardLabel}>SECURITY</p>
          <p className={styles.cardValue}>
            {account.mfa.enabled ? "2FA on" : "2FA off"}
          </p>
          <p className={styles.cardText}>
            {account.mfa.enabled
              ? `${account.mfa.recoveryCodesLeft} recovery codes left.`
              : "Add an authenticator app to protect your account."}
          </p>
          <span className={`${styles.badge} ${account.mfa.enabled ? styles.badgeOn : styles.badgeWarn}`} style={{ marginTop: 18 }}>
            {account.mfa.enabled ? "PROTECTED" : "RECOMMENDED"}
          </span>
        </Link>

        <Link href="/account/discord" className={styles.card}>
          <p className={styles.cardLabel}>DISCORD</p>
          <p className={styles.cardValue}>{account.discord ? `@${account.discord.username}` : "Not linked"}</p>
          <p className={styles.cardText}>
            Your server roles follow what you own on KUSH.
          </p>
        </Link>

        <Link href="/account/commissions" className={styles.card}>
          <p className={styles.cardLabel}>COMMISSIONS</p>
          <p className={styles.cardValue}>Your projects</p>
          <p className={styles.cardText}>Track enquiries, quotes and delivery.</p>
        </Link>

        <Link href="/account/support" className={styles.card}>
          <p className={styles.cardLabel}>SUPPORT</p>
          <p className={styles.cardValue}>Tickets</p>
          <p className={styles.cardText}>Conversations with the KUSH team.</p>
        </Link>
      </div>
    </>
  );
}
