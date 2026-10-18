import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteDecision } from "@/components/account/workspace-forms";
import styles from "@/components/account/account.module.css";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import {
  commissionLabel,
  commissionStages,
  dateTime,
  milestoneLabel,
  needsYou,
  type Commission,
  type Milestone,
  type Quote,
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
  let quotes: Quote[] = [];
  let milestones: Milestone[] = [];
  let ticketId: string | null = null;
  try {
    ({ commission, quotes, milestones, ticketId } = await kushApi<{
      commission: Commission;
      quotes: Quote[];
      milestones: Milestone[];
      ticketId: string | null;
    }>(`/web/workspace/commissions/${id}`, { token }));
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

      {quotes.length ? (
        <section className={styles.section} aria-labelledby="quotes">
          <h2 id="quotes" className={styles.sectionTitle}>
            Quotes
          </h2>
          {quotes.map((q) => (
            <div key={q.id} className={styles.card} style={{ marginBottom: 12, borderColor: q.status === "proposed" ? "rgba(167,250,67,.45)" : undefined }}>
              <div className={styles.headerRow}>
                <p className={styles.cardValue}>{q.amount}</p>
                <span className={`${styles.badge} ${q.status === "proposed" ? styles.badgeWarn : q.status === "accepted" ? styles.badgeOn : ""}`}>
                  {q.status === "proposed" ? "AWAITING YOUR DECISION" : q.status.toUpperCase()}
                </span>
              </div>
              <p className={styles.prose} style={{ marginTop: 12 }}>
                {q.summary}
              </p>
              <p className={styles.rowMeta} style={{ marginTop: 10 }}>
                {q.timeframe ? `Timeframe: ${q.timeframe} · ` : ""}Sent {dateTime.format(new Date(q.createdAt))}
              </p>
              {q.status === "proposed" ? (
                <div style={{ marginTop: 16 }}>
                  <QuoteDecision requestId={commission.id} quoteId={q.id} />
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {milestones.length ? (
        <section className={styles.section} aria-labelledby="milestones">
          <h2 id="milestones" className={styles.sectionTitle}>
            Milestones
          </h2>
          <ol className={styles.timeline}>
            {milestones.map((m) => (
              <li key={m.id} className={`${styles.stage} ${m.status === "done" ? styles.stageDone : ""} ${m.status === "in_progress" ? styles.stageCurrent : ""}`}>
                <p className={styles.stageTitle}>{m.title}</p>
                <p className={styles.stageText}>{milestoneLabel[m.status]}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {ticketId ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Conversation</h2>
          <Link href={`/account/support/${ticketId}`} className={styles.listLink}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>Talk to the team about this commission</p>
              <p className={styles.rowMeta}>Questions, files and feedback. Replies also reach you on Discord.</p>
            </div>
          </Link>
        </section>
      ) : null}
    </>
  );
}
