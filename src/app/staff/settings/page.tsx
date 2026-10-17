import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff, roleLabel, type StaffRole } from "@/lib/server/staff";

interface Settings {
  roleMappings: { discordRoleId: string; staffRole: StaffRole }[];
  positions: { key: string; title: string; staffRole: StaffRole; discordRoleId: string | null; open: boolean }[];
  nda: { version: string; status: string } | null;
  security: { staffMfaHours: number; webSessionDays: number; webIdleDays: number; paymentsLive: boolean };
}

export default async function StaffSettings() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "operations.view")) return <p className={styles.lede}>Settings are for administrators.</p>;
  const s = await kushApi<Settings>("/web/staff/settings", { token: gate.token });
  return (
    <>
      <p className={styles.kicker}>SETTINGS</p>
      <h1 className={styles.title}>
        How it&apos;s <em>wired.</em>
      </h1>
      <p className={styles.lede}>
        Read-only view of the rules the platform enforces. Changes are made deliberately in code and scripts, reviewed
        and committed, never by a click here.
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>STAFF 2FA</p>
          <p className={styles.cardValue}>Every {s.security.staffMfaHours}h</p>
          <p className={styles.cardText}>Staff tools need 2FA on, re-confirmed at least this often.</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>WEBSITE SESSIONS</p>
          <p className={styles.cardValue}>{s.security.webSessionDays} days</p>
          <p className={styles.cardText}>Signed out after {s.security.webIdleDays} days without use.</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>STAFF NDA</p>
          <p className={styles.cardValue}>{s.nda ? s.nda.version : "None"}</p>
          <p className={styles.cardText}>{s.nda ? `Status: ${s.nda.status}. Activate it under Agreements before issuing.` : "-"}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>PAYMENTS</p>
          <p className={styles.cardValue}>{s.security.paymentsLive ? "Live" : "Off"}</p>
          <p className={styles.cardText}>No payment provider is connected.</p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Discord role → staff role</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 12 }}>
          Matched by Discord role ID, never by name. Roles are checked live with Discord on every staff request.
        </p>
        {s.roleMappings.map((m) => (
          <div key={`${m.discordRoleId}-${m.staffRole}`} className={styles.row} style={{ padding: "10px 0" }}>
            <span className={styles.mono} style={{ fontSize: 13 }}>
              {m.discordRoleId}
            </span>
            <span className={styles.badge}>{roleLabel[m.staffRole].toUpperCase()}</span>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Open positions</h2>
        {s.positions.map((p) => (
          <div key={p.key} className={styles.row} style={{ padding: "10px 0" }}>
            <span>
              {p.title} <span className={styles.rowMeta}>→ {roleLabel[p.staffRole]}</span>
            </span>
            <span className={`${styles.badge} ${p.open ? styles.badgeOn : ""}`}>{p.open ? "OPEN" : "CLOSED"}</span>
          </div>
        ))}
      </section>
    </>
  );
}
