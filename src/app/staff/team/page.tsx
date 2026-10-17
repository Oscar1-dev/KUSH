import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff, roleLabel, type StaffRole } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

export default async function StaffTeam() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "team.view")) return <p className={styles.lede}>Your roles don&apos;t include team management.</p>;
  const { team } = await kushApi<{ team: { userId: string; name: string; roles: StaffRole[]; lastVerifiedAt: string }[] }>(
    "/web/staff/team",
    { token: gate.token },
  );
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
      {team.map((m) => (
        <div key={m.userId} className={styles.row}>
          <div className={styles.rowMain}>
            <p className={styles.rowTitle}>{m.name}</p>
            <p className={styles.rowMeta}>Last verified {dateTime.format(new Date(m.lastVerifiedAt))}</p>
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
    </>
  );
}
