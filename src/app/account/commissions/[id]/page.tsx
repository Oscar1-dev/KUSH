import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "@/components/account/account.module.css";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import {
  commissionLabel,
  commissionStages,
  dateTime,
  needsYou,
  type Commission,
} from "@/lib/workspace";

export default async function CommissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await requireAccount();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let commission: Commission;
  try {
    commission = (await kushApi<{ commission: Commission }>(`/web/workspace/commissions/${id}`, { token })).commission;
  } catch (error) {
    // Someone else's commission looks exactly like a missing one.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const cancelled = commission.status === "cancelled";
  // "Waiting for you" sits between review and quote in the journey.
  const position = commissionStages.findIndex(
    (s) => s.status === (commission.status === "awaiting_customer" ? "reviewing" : commission.status),
  );

  return (
    <>
      <Link href="/account/commissions" className={styles.rowMeta}>
        ← My commissions
      </Link>
      {isNew ? (
        <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status" style={{ marginTop: 20 }}>
          Enquiry sent. The KUSH team will review it and get back to you.
        </p>
      ) : null}
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        {commission.category.toUpperCase()} COMMISSION
      </p>
      <h1 className={styles.title} style={{ fontSize: "clamp(36px, 5vw, 64px)" }}>
        {commission.title}
      </h1>
      <p className={styles.rowMeta} style={{ marginBottom: 32 }}>
        Started {dateTime.format(new Date(commission.createdAt))} · updated{" "}
        {dateTime.format(new Date(commission.updatedAt))}
        {commission.assigned ? " · a KUSH team member is assigned" : ""}
      </p>

      <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
        <section className={styles.card} aria-labelledby="progress">
          <p id="progress" className={styles.cardLabel}>
            PROGRESS
          </p>
          {cancelled ? (
            <p className={styles.cardValue}>Cancelled</p>
          ) : (
            <ol className={styles.timeline}>
              {commissionStages.map((stage, index) => (
                <li
                  key={stage.status}
                  className={`${styles.stage} ${index < position ? styles.stageDone : ""} ${index === position ? styles.stageCurrent : ""}`}
                  aria-current={index === position ? "step" : undefined}
                >
                  <p className={styles.stageTitle}>
                    {index === position && commission.status === "awaiting_customer" ? "Waiting for you" : stage.label}
                  </p>
                  {index === position ? <p className={styles.stageText}>{stage.text}</p> : null}
                </li>
              ))}
            </ol>
          )}
          {needsYou(commission.status) ? (
            <p className={`${styles.notice} ${styles.badgeWarn}`} style={{ marginTop: 6 }}>
              {commissionLabel[commission.status]}: the team will contact you on Discord with the details.
            </p>
          ) : null}
        </section>

        <section className={styles.card} aria-labelledby="brief">
          <p id="brief" className={styles.cardLabel}>
            YOUR BRIEF
          </p>
          <p className={styles.prose}>{commission.details}</p>
          <div className={styles.row} style={{ marginTop: 22 }}>
            <span className={styles.rowMeta}>Budget</span>
            <span>{commission.approximateBudget ?? "Not given"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Timeframe</span>
            <span>{commission.preferredTimeframe ?? "Not given"}</span>
          </div>
        </section>
      </div>
    </>
  );
}
