import MfaPanel from "@/components/account/mfa-panel";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

export default async function SecurityPage() {
  const { account } = await requireAccount();
  const { enabled, recoveryCodesLeft } = account.mfa;
  return (
    <>
      <p className={styles.kicker}>SECURITY &amp; 2FA</p>
      <h1 className={styles.title}>
        Lock it <em>down.</em>
      </h1>
      <p className={styles.lede}>
        Two-factor authentication asks for a code from your phone when you
        sign in. It is optional for customers and required for KUSH staff.
      </p>

      <div className={styles.row} style={{ marginBottom: 28 }}>
        <div className={styles.rowMain}>
          <p className={styles.rowTitle}>Authenticator app</p>
          <p className={styles.rowMeta}>
            {enabled
              ? `On · ${recoveryCodesLeft} of 10 recovery codes left`
              : "Off"}
          </p>
        </div>
        <span className={`${styles.badge} ${enabled ? styles.badgeOn : styles.badgeWarn}`}>
          {enabled ? "ON" : "OFF"}
        </span>
      </div>
      {enabled && recoveryCodesLeft <= 3 ? (
        <p className={`${styles.notice} ${styles.noticeError}`} role="alert" style={{ marginBottom: 20 }}>
          You are running out of recovery codes. Create new ones below.
        </p>
      ) : null}

      <MfaPanel enabled={enabled} />
    </>
  );
}
