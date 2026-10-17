import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface Ops {
  bot: {
    status: string;
    uptimeSeconds: number;
    gateway: { state: string; reconnects: number; lastDisconnect: { at: string; code: number } | null };
    guild: { state: string };
    api: { state: string };
    automation: {
      notifications: { delivered: number; undeliverable: number; failed: number; lastError: string | null } | null;
      roleSync: { processed: number; failed: number } | null;
    };
  } | null;
  outbox: { kind: string; status: string; count: number }[];
  problems: { id: string; kind: string; attempts: number; lastError: string | null; createdAt: string; status: string }[];
  roleSync: { status: string; count: number }[];
}

const tone = (state: string | undefined) => (state === "ok" ? styles.badgeOn : styles.badgeWarn);

export default async function StaffOperations() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "operations.view")) return <p className={styles.lede}>Operations are for administrators.</p>;
  const ops = await kushApi<Ops>("/web/staff/operations", { token: gate.token });
  const bot = ops.bot;
  const hours = bot ? Math.floor(bot.uptimeSeconds / 3600) : 0;

  return (
    <>
      <p className={styles.kicker}>DISCORD &amp; OPERATIONS</p>
      <h1 className={styles.title}>
        System <em>health.</em>
      </h1>
      <p className={styles.lede}>Live status of the KUSH bot, the Discord connection and the delivery queue between the website and Discord.</p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>DISCORD BOT</p>
          <p className={styles.cardValue}>{bot ? bot.status.toUpperCase() : "UNREACHABLE"}</p>
          <p className={styles.cardText}>{bot ? `Up ${hours}h · guild ${bot.guild.state} · API ${bot.api.state}` : "The bot's health endpoint did not answer."}</p>
          <span className={`${styles.badge} ${tone(bot?.status)}`} style={{ marginTop: 14 }}>
            GATEWAY {bot?.gateway.state.toUpperCase() ?? "?"}
          </span>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>GATEWAY</p>
          <p className={styles.cardValue}>{bot ? `${bot.gateway.reconnects} reconnects` : "-"}</p>
          <p className={styles.cardText}>
            {bot?.gateway.lastDisconnect
              ? `Last drop ${dateTime.format(new Date(bot.gateway.lastDisconnect.at))} (code ${bot.gateway.lastDisconnect.code}). Resumes replay missed events.`
              : "No disconnects since the bot started."}
          </p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>DELIVERIES (THIS RUN)</p>
          <p className={styles.cardValue}>{bot?.automation.notifications?.delivered ?? 0} sent</p>
          <p className={styles.cardText}>
            {bot?.automation.notifications
              ? `${bot.automation.notifications.undeliverable} undeliverable (DMs closed etc.) · ${bot.automation.notifications.failed} failed attempts`
              : "-"}
          </p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>ROLE SYNC</p>
          <p className={styles.cardValue}>{ops.roleSync.find((r) => r.status === "pending")?.count ?? 0} pending</p>
          <p className={styles.cardText}>{ops.roleSync.map((r) => `${r.count} ${r.status}`).join(" · ") || "No jobs yet."}</p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Website → Discord queue (last 7 days)</h2>
        {ops.outbox.length === 0 ? <p className={styles.rowMeta}>Nothing queued.</p> : null}
        {ops.outbox.map((row) => (
          <div key={`${row.kind}-${row.status}`} className={styles.row} style={{ padding: "10px 0" }}>
            <span className={styles.mono} style={{ fontSize: 13 }}>
              {row.kind}
            </span>
            <span className={`${styles.badge} ${row.status === "failed" ? styles.badgeWarn : row.status === "done" ? styles.badgeOn : ""}`}>
              {row.count} {row.status.toUpperCase()}
            </span>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Needs attention</h2>
        {ops.problems.length === 0 ? <p className={styles.rowMeta}>No failed or retrying deliveries.</p> : null}
        {ops.problems.map((p) => (
          <div key={p.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {p.kind} · {p.status} after {p.attempts} attempts
              </p>
              <p className={styles.rowMeta}>
                {dateTime.format(new Date(p.createdAt))}
                {p.lastError ? ` · ${p.lastError}` : ""}
              </p>
            </div>
            <ActionForm action="retryJob" hidden={{ jobId: p.id }} submit="RETRY" tone="plain" />
          </div>
        ))}
      </section>
    </>
  );
}
