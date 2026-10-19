import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { money } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateOnly, dateTime } from "@/lib/workspace";

interface Referral {
  id: string;
  inviterDiscordId: string;
  invitedDiscordId: string;
  source: "invite" | "code";
  confidence: "exact" | "probable" | "claimed";
  status: "pending" | "qualified" | "flagged" | "disqualified";
  statusReason: string | null;
  joinedAt: string;
  accountCreatedAt: string;
  leftAt: string | null;
}

interface Reward {
  id: string;
  discordUserId: string;
  milestone: number;
  type: "credit" | "service_voucher" | "product_voucher";
  valuePence: number | null;
  status: "issued" | "redeemed" | "revoked";
  issuedAt: string;
  redeemedNote: string | null;
}

const rewardType: Record<Reward["type"], string> = {
  credit: "Store credit",
  service_voucher: "Free eligible service + customer role",
  product_voucher: "Free product",
};

const ageDays = (from: string, to: string) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

export default async function StaffReferrals() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "referrals.review")) return <p className={styles.lede}>Referrals are reviewed by managers and administrators.</p>;
  const { referrals, rewards } = await kushApi<{ referrals: Referral[]; rewards: Reward[] }>("/web/staff/referrals", {
    token: gate.token,
  });
  const flagged = referrals.filter((r) => r.status === "flagged");
  const toFulfil = rewards.filter((r) => r.status === "issued" && r.type !== "credit");

  return (
    <>
      <p className={styles.kicker}>REFERRALS</p>
      <h1 className={styles.title}>
        Fair <em>rewards.</em>
      </h1>
      <p className={styles.lede}>
        Joins are attributed from Discord invites (exact or probable) or a referral code (claimed). Anything unusual is
        flagged here instead of counting automatically.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>To review ({flagged.length})</h2>
        {flagged.length === 0 ? (
          <p className={styles.cardText}>Nothing flagged.</p>
        ) : (
          flagged.map((r) => (
            <div key={r.id} className={styles.card} style={{ marginBottom: 12 }}>
              <p className={styles.rowTitle}>
                {r.inviterDiscordId} → {r.invitedDiscordId}
              </p>
              <p className={styles.rowMeta}>
                {r.statusReason ?? "Flagged"} · {r.source} ({r.confidence}) · joined {dateTime.format(new Date(r.joinedAt))} ·
                account {ageDays(r.accountCreatedAt, r.joinedAt)} days old{r.leftAt ? " · has left" : ""}
              </p>
              <div className={styles.formRow} style={{ alignItems: "flex-start", marginTop: 12 }}>
                <ActionForm action="reviewReferral" hidden={{ referralId: r.id, decision: "approve" }} submit="LOOKS GENUINE">
                  <input name="reason" className={styles.input} required minLength={3} maxLength={300} placeholder="Why (for the audit log)" aria-label="Reason for approving" />
                </ActionForm>
                <ActionForm action="reviewReferral" hidden={{ referralId: r.id, decision: "disqualify" }} submit="DISQUALIFY" tone="danger">
                  <input name="reason" className={styles.input} required minLength={3} maxLength={300} placeholder="Why (for the audit log)" aria-label="Reason for disqualifying" />
                </ActionForm>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rewards to deliver ({toFulfil.length})</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 12 }}>
          Credit rewards are added automatically. Free services and products are delivered by staff; mark them once done.
        </p>
        {toFulfil.map((reward) => (
          <div key={reward.id} className={styles.card} style={{ marginBottom: 12 }}>
            <p className={styles.rowTitle}>
              {rewardType[reward.type]} · {reward.milestone} referrals
              {reward.valuePence ? ` · up to ${money(reward.valuePence)}` : ""}
            </p>
            <p className={styles.rowMeta}>
              Discord {reward.discordUserId} · earned {dateOnly.format(new Date(reward.issuedAt))}
            </p>
            <ActionForm action="redeemReward" hidden={{ rewardId: reward.id }} submit="MARK DELIVERED" tone="plain">
              <input name="note" className={styles.input} required minLength={3} maxLength={300} placeholder="What was given (e.g. Rust config, order #1042)" aria-label="What was delivered" />
            </ActionForm>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent referrals</h2>
        {referrals.slice(0, 50).map((r) => (
          <div key={r.id} className={styles.row}>
            <span>
              {r.inviterDiscordId} → {r.invitedDiscordId}
              <span className={styles.rowMeta} style={{ display: "block" }}>
                {r.source} ({r.confidence}) · {dateOnly.format(new Date(r.joinedAt))}
                {r.statusReason ? ` · ${r.statusReason}` : ""}
              </span>
            </span>
            <span className={`${styles.badge} ${r.status === "qualified" ? styles.badgeOn : r.status === "flagged" ? styles.badgeWarn : ""}`}>
              {r.status.toUpperCase()}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
