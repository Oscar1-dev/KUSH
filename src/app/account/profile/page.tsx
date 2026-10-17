import { Avatar } from "@/components/account/avatar";
import DisplayNameForm from "@/components/account/display-name-form";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

export default async function ProfilePage() {
  const { account } = await requireAccount();
  return (
    <>
      <p className={styles.kicker}>MY ACCOUNT</p>
      <h1 className={styles.title}>
        Your <em>profile.</em>
      </h1>
      <p className={styles.lede}>How you appear to the KUSH team across the website and Discord.</p>

      <div className={styles.card} style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24 }}>
        <Avatar account={account} />
        <div style={{ minWidth: 0 }}>
          <p className={styles.rowTitle}>{account.displayName ?? "No display name"}</p>
          <p className={styles.rowMeta}>
            KUSH ID <span className={styles.mono}>{account.id}</span>
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <p className={styles.cardLabel}>DISPLAY NAME</p>
        <DisplayNameForm initial={account.displayName ?? ""} />
      </div>

      <section className={styles.section} aria-labelledby="recovery">
        <h2 id="recovery" className={styles.sectionTitle}>Account recovery</h2>
        <p className={styles.cardText} style={{ maxWidth: 640 }}>
          You sign in with Discord, so keeping your Discord account secure keeps
          this account secure. If you turn on two-factor authentication, store
          your recovery codes somewhere safe; they are the only way in if you
          lose your authenticator. If you lose both, open a ticket in the KUSH
          Discord from the same Discord account and the team will verify you.
        </p>
      </section>
    </>
  );
}
