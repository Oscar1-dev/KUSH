import styles from "@/components/account/account.module.css";
import ActionForm from "@/components/staff/action-form";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface ModerationCase {
  number: number;
  kind: string;
  targetId: string;
  moderatorId: string | null;
  reason: string;
  durationSeconds: number | null;
  source: "bot" | "discord";
  createdAt: string;
}
interface StaffVouch {
  number: number;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
  discordUserId: string;
  hiddenAt: string | null;
  inDiscord: boolean;
}

const kinds: Record<string, string> = {
  warn: "Warning",
  timeout: "Timeout",
  untimeout: "Timeout lifted",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban lifted",
  note: "Staff note",
};
const duration = (seconds: number) =>
  seconds < 3_600 ? `${Math.round(seconds / 60)} min` : seconds < 86_400 ? `${Math.round(seconds / 3_600)} h` : `${Math.round(seconds / 86_400)} d`;

export default async function StaffModeration({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  const canCases = has(gate.me, "moderation.view");
  const canVouches = has(gate.me, "vouches.manage");
  if (!canCases && !canVouches) return <p className={styles.lede}>Your roles don&apos;t include moderation.</p>;

  const { target: raw } = await searchParams;
  const target = raw && /^[0-9]{17,20}$/.test(raw) ? raw : undefined;
  const [cases, vouches] = await Promise.all([
    canCases
      ? kushApi<{ cases: ModerationCase[] }>(`/web/staff/moderation/cases${target ? `?target=${target}` : ""}`, { token: gate.token })
          .then((r) => r.cases)
          .catch(() => null)
      : Promise.resolve(null),
    canVouches
      ? kushApi<{ vouches: StaffVouch[] }>("/web/staff/vouches", { token: gate.token })
          .then((r) => r.vouches)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <p className={styles.kicker}>MODERATION</p>
      <h1 className={styles.title}>
        Keep it <em>clean.</em>
      </h1>
      <p className={styles.lede}>
        The same records as Discord. Cases come from bot commands and from Discord&apos;s own ban, kick and timeout
        tools. Removing a vouch here also deletes it from #vouches.
      </p>

      {canCases ? (
        <section className={styles.section}>
          <div className={styles.headerRow}>
            <h2 className={styles.sectionTitle}>{target ? "Member history" : "Latest cases"}</h2>
            <form className={styles.formRow} action="/staff/moderation">
              <input
                className={styles.input}
                name="target"
                defaultValue={target ?? ""}
                placeholder="Discord user ID"
                inputMode="numeric"
                pattern="[0-9]{17,20}"
                style={{ width: 240 }}
                aria-label="Filter by Discord user ID"
              />
              <button className={styles.button}>SEARCH</button>
              {target ? (
                <a className={styles.button} href="/staff/moderation">
                  CLEAR
                </a>
              ) : null}
            </form>
          </div>
          {cases === null ? (
            <p className={`${styles.notice} ${styles.noticeError}`}>Cases couldn&apos;t be loaded. Try again shortly.</p>
          ) : cases.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No cases</p>
              <p className={styles.emptyText}>{target ? "Nothing on record for that member." : "Nothing has been recorded yet."}</p>
            </div>
          ) : (
            cases.map((item) => (
              <div key={item.number} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    Case #{item.number} · {kinds[item.kind] ?? item.kind}
                    {item.durationSeconds ? ` (${duration(item.durationSeconds)})` : ""}
                  </p>
                  <p className={styles.rowMeta}>
                    Member <span className="mono">{item.targetId}</span> · by{" "}
                    {item.moderatorId ? <span className="mono">{item.moderatorId}</span> : "Discord"} ·{" "}
                    {dateTime.format(new Date(item.createdAt))}
                  </p>
                  <p className={styles.cardText} style={{ marginTop: 6 }}>
                    {item.reason}
                  </p>
                </div>
                <span className={`${styles.badge} ${item.kind === "ban" || item.kind === "kick" ? styles.badgeWarn : ""}`}>
                  {item.source === "bot" ? "BOT COMMAND" : "DISCORD"}
                </span>
              </div>
            ))
          )}
        </section>
      ) : null}

      {canVouches ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Vouches</h2>
          {vouches === null ? (
            <p className={`${styles.notice} ${styles.noticeError}`}>Vouches couldn&apos;t be loaded. Try again shortly.</p>
          ) : vouches.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No vouches yet</p>
              <p className={styles.emptyText}>Verified customers post them in Discord with !vouch.</p>
            </div>
          ) : (
            vouches.map((v) => (
              <div key={v.number} className={styles.row} style={v.hiddenAt ? { opacity: 0.55 } : undefined}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    #{v.number} · {"★".repeat(v.rating)}
                    {"☆".repeat(5 - v.rating)} · {v.authorName}
                  </p>
                  <p className={styles.cardText} style={{ marginTop: 4 }}>
                    &ldquo;{v.body}&rdquo;
                  </p>
                  <p className={styles.rowMeta} style={{ marginTop: 6 }}>
                    <span className="mono">{v.discordUserId}</span> · {dateTime.format(new Date(v.createdAt))}
                    {v.hiddenAt ? ` · removed ${dateTime.format(new Date(v.hiddenAt))}` : ""}
                  </p>
                </div>
                {v.hiddenAt ? (
                  <span className={styles.badge}>REMOVED</span>
                ) : (
                  <ActionForm action="hideVouch" hidden={{ number: v.number }} submit="REMOVE" tone="danger" />
                )}
              </div>
            ))
          )}
        </section>
      ) : null}
    </>
  );
}
