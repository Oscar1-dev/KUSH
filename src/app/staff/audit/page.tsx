import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

export default async function StaffAudit() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "audit.view")) return <p className={styles.lede}>The audit log is for administrators.</p>;
  const { events } = await kushApi<{ events: { id: string; action: string; createdAt: string; actorName: string | null }[] }>(
    "/web/staff/audit",
    { token: gate.token },
  );
  return (
    <>
      <p className={styles.kicker}>AUDIT LOG</p>
      <h1 className={styles.title}>
        Every <em>action.</em>
      </h1>
      <p className={styles.lede}>The latest 200 security and staff events. Records cannot be edited from here.</p>
      {events.map((e) => (
        <div key={e.id} className={styles.row} style={{ padding: "12px 0" }}>
          <div className={styles.rowMain}>
            <p className={`${styles.rowTitle} ${styles.mono}`} style={{ fontSize: 13 }}>
              {e.action}
            </p>
            <p className={styles.rowMeta}>{e.actorName ?? "System"}</p>
          </div>
          <span className={styles.rowMeta}>{dateTime.format(new Date(e.createdAt))}</span>
        </div>
      ))}
    </>
  );
}
