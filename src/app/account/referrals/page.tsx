import Link from "next/link";
import { Users } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { money, type ReferralSummary } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";

export const metadata = { title: "Referrals" };

const rewardStatus: Record<string, string> = {
  issued: "Yours",
  redeemed: "Used",
  revoked: "Withdrawn",
};

export default async function ReferralsPage() {
  const { token } = await requireAccount();
  const summary = await kushApi<ReferralSummary>("/web/workspace/referrals", { token });

  if (!summary.linked)
    return (
      <>
        <p className={styles.kicker}>REFERRALS</p>
        <h1 className={styles.title}>
          Invite friends, <em>earn rewards.</em>
        </h1>
        <div className={styles.empty}>
          <Users size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>Link Discord first</p>
          <p className={styles.emptyText}>
            Referrals are counted when people join the KUSH Discord, so your account needs a linked Discord.
          </p>
          <Link href="/account/discord" className={styles.button} style={{ marginTop: 16 }}>
            LINK DISCORD
          </Link>
        </div>
      </>
    );

  const next = summary.next;
  const progress = next ? Math.min(100, Math.round(((summary.qualified ?? 0) / next.count) * 100)) : 100;

  return (
    <>
      <p className={styles.kicker}>REFERRALS</p>
      <h1 className={styles.title}>
        {summary.qualified ?? 0} <em>qualified.</em>
      </h1>
      <p className={styles.lede}>
        Share your code. When someone joins the KUSH Discord with it (or through your invite link) and sticks around,
        it counts towards your rewards.
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>YOUR CODE</p>
          <p className={`${styles.cardValue} ${styles.mono}`}>{summary.code}</p>
          <p className={styles.cardText}>
            New members type <span className={styles.mono}>/referral claim {summary.code}</span> in Discord.
          </p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>NEXT REWARD</p>
          <p className={styles.cardValue}>{next ? next.label : "All unlocked"}</p>
          {next ? (
            <>
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress to next reward"
                style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", marginTop: 12, overflow: "hidden" }}
              >
                <div style={{ width: `${progress}%`, height: "100%", background: "var(--green)" }} />
              </div>
              <p className={styles.cardText}>{next.remaining} more to go.</p>
            </>
          ) : null}
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>WAITING</p>
          <p className={styles.cardValue}>{summary.pending ?? 0}</p>
          <p className={styles.cardText}>
            Joined recently; they count after {summary.rules?.minMembershipDays ?? 7} days.
            {summary.underReview ? ` ${summary.underReview} being checked by staff.` : ""}
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rewards</h2>
        {(summary.milestones ?? []).map((milestone) => {
          const reward = summary.rewards?.find((r) => r.milestone === milestone.count);
          return (
            <div key={milestone.count} className={styles.row}>
              <span>
                <strong>{milestone.count} referrals</strong> · {milestone.label}
              </span>
              <span className={`${styles.badge} ${reward ? styles.badgeOn : ""}`}>
                {reward
                  ? (rewardStatus[reward.status] ?? reward.status).toUpperCase()
                  : `${Math.max(0, milestone.count - (summary.qualified ?? 0))} TO GO`}
              </span>
            </div>
          );
        })}
        {summary.rewards?.some((r) => r.valuePence) ? (
          <p className={styles.fine} style={{ marginTop: 12 }}>
            Credit rewards are in your <Link href="/account/credit">store credit</Link> (
            {money(summary.rewards.reduce((sum, r) => sum + (r.valuePence ?? 0), 0))} so far).
          </p>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The rules</h2>
        <p className={styles.prose}>
          A referral counts when the person&apos;s Discord account is at least {summary.rules?.minAccountAgeDays ?? 14}{" "}
          days old, they stay in the server for {summary.rules?.minMembershipDays ?? 7} days, and they haven&apos;t been
          referred by anyone before. You can&apos;t refer yourself or alternate accounts; unusual patterns are checked by
          staff before rewards are given. Rewards are store credit or services, never cash. Full details are in the{" "}
          <Link href="/terms">terms</Link>.
        </p>
      </section>
    </>
  );
}
