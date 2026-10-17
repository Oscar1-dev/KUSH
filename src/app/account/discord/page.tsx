import { Avatar } from "@/components/account/avatar";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

export default async function DiscordPage() {
  const { account } = await requireAccount();
  const { discord } = account;
  return (
    <>
      <p className={styles.kicker}>LINKED DISCORD</p>
      <h1 className={styles.title}>
        Your <em>Discord.</em>
      </h1>
      <p className={styles.lede}>
        You sign in with this Discord account. Roles in the KUSH server, such
        as Verified Customer, follow what you own here. They are updated
        automatically and never decided by the Discord app itself.
      </p>
      {discord ? (
        <div className={styles.card} style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <Avatar account={account} />
          <div style={{ minWidth: 0 }}>
            <p className={styles.rowTitle}>@{discord.username}</p>
            <p className={styles.rowMeta}>
              Discord ID <span className={styles.mono}>{discord.id}</span>
            </p>
          </div>
          <span className={`${styles.badge} ${styles.badgeOn}`} style={{ marginLeft: "auto" }}>
            VERIFIED
          </span>
        </div>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No Discord account linked</p>
          <p className={styles.emptyText}>Sign out and sign in again with Discord to link one.</p>
        </div>
      )}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Switching Discord accounts</h2>
        <p className={styles.cardText} style={{ maxWidth: 640 }}>
          Your KUSH account belongs to the Discord account you sign in with. To
          move to a different Discord account, open a ticket in the KUSH
          Discord and the team will transfer it after checking both accounts
          are yours.
        </p>
      </section>
    </>
  );
}
