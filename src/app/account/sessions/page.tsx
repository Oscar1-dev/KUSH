import SessionActions from "@/components/account/session-actions";
import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";

interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string;
  mfaVerified: boolean;
  current: boolean;
}

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** A readable device name from the user agent, without third-party parsing. */
function device(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown device";
  return `${browser} on ${os}`;
}

export default async function SessionsPage() {
  const { token } = await requireAccount();
  const { sessions } = await kushApi<{ sessions: SessionRow[] }>("/web/account/sessions", { token });

  return (
    <>
      <p className={styles.kicker}>ACTIVE SESSIONS</p>
      <h1 className={styles.title}>
        Where you&apos;re <em>signed in.</em>
      </h1>
      <p className={styles.lede}>
        Sessions end after 7 days without use, and always after 30 days. If you
        don&apos;t recognise one, sign it out.
      </p>

      <div>
        {sessions.map((session) => (
          <div key={session.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {device(session.userAgent)}{" "}
                {session.current ? (
                  <span className={`${styles.badge} ${styles.badgeOn}`} style={{ marginLeft: 8 }}>
                    THIS DEVICE
                  </span>
                ) : null}
              </p>
              <p className={styles.rowMeta}>
                Signed in {when.format(new Date(session.createdAt))} · last active{" "}
                {when.format(new Date(session.lastSeenAt))}
                {session.mfaVerified ? " · 2FA verified" : ""}
              </p>
            </div>
            {session.current ? null : <SessionActions sessionId={session.id} />}
          </div>
        ))}
      </div>

      <div className={styles.formRow} style={{ marginTop: 28 }}>
        <SessionActions everywhere />
      </div>
    </>
  );
}
