import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff, roleLabel, type StaffRole } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

export default async function StaffTeam() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "team.view")) return <p className={styles.lede}>Your roles don&apos;t include team management.</p>;
  const { team } = await kushApi<{
    team: {
      userId: string;
      name: string;
      roles: StaffRole[];
      lastVerifiedAt: string;
      applicationNumber: number | null;
      ndaSignedAt: string | null;
      ndaSignedVia: "website" | "discord" | null;
      offboardedAt: string | null;
      offboardedReason: string | null;
    }[];
  }>(
    "/web/staff/team",
    { token: gate.token },
  );
  const current = team.filter((m) => !m.offboardedAt);
  const former = team.filter((m) => m.offboardedAt);
  return (
    <>
      <p className={styles.kicker}>TEAM</p>
      <h1 className={styles.title}>
        The <em>crew.</em>
      </h1>
      <p className={styles.lede}>
        Staff who have used the dashboard, with the roles Discord reported last time. Roles are managed in Discord;
        access is always re-checked live.
      </p>
      {current.length === 0 ? <p className={styles.lede}>Nobody on the team has used the dashboard yet.</p> : null}
      {current.map((m) => (
        <div key={m.userId} className={styles.row}>
          <div className={styles.rowMain}>
            <p className={styles.rowTitle}>{m.name}</p>
            <p className={styles.rowMeta}>
              {m.ndaSignedAt
                ? `NDA signed ${dateTime.format(new Date(m.ndaSignedAt))} ${m.ndaSignedVia === "discord" ? "in Discord" : "on the website"}`
                : m.roles.every((r) => r === "moderator")
                  ? "No NDA needed (Moderator)"
                  : "No NDA on record"}
              {m.applicationNumber ? ` · joined via application #${m.applicationNumber}` : ""} · roles verified{" "}
              {dateTime.format(new Date(m.lastVerifiedAt))}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {m.roles.map((r) => (
              <span key={r} className={styles.badge}>
                {(roleLabel[r] ?? r).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      ))}
      {former.length ? (
        <>
          <p className={styles.kicker} style={{ marginTop: 36 }}>
            FORMER STAFF
          </p>
          <p className={styles.lede}>
            Offboarded with <code>!offboard</code> in Discord. Their roles were removed and open work went back to the
            queue; signed agreements stay on record.
          </p>
          {former.map((m) => (
            <div key={m.userId} className={styles.row} style={{ opacity: 0.7 }}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{m.name}</p>
                <p className={styles.rowMeta}>
                  Offboarded {dateTime.format(new Date(m.offboardedAt!))}
                  {m.offboardedReason ? ` · ${m.offboardedReason}` : ""}
                  {m.ndaSignedAt ? " · NDA remains in effect" : ""}
                </p>
              </div>
              <span className={styles.badge}>FORMER</span>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
