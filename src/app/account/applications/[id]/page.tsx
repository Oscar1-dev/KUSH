import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature } from "lucide-react";

import { RecruitMessageForm, WithdrawForm } from "@/components/account/recruitment-forms";
import styles from "@/components/account/account.module.css";
import { applicationLabel, applicationStages, stageIndex, type Application, type ApplicationStatus } from "@/lib/recruitment";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime } from "@/lib/workspace";

interface Detail {
  application: Application;
  messages: { id: string; content: string; createdAt: string; fromYou: boolean }[];
  events: { status: ApplicationStatus; createdAt: string }[];
  agreement: { id: string; status: string; expiresAt: string; signedAt: string | null } | null;
}

export default async function ApplicationPage({
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
  let detail: Detail;
  try {
    detail = await kushApi<Detail>(`/web/recruitment/applications/${id}`, { token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { application: a, messages, agreement } = detail;
  const closed = ["rejected", "withdrawn", "activated"].includes(a.status);
  const position = stageIndex(a.status);

  return (
    <>
      <Link href="/account/applications" className={styles.rowMeta}>
        ← Staff applications
      </Link>
      {isNew ? (
        <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status" style={{ marginTop: 20 }}>
          Application sent. A private channel with the recruitment team opens in the KUSH Discord shortly.
        </p>
      ) : null}
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        APPLICATION #{a.number}
      </p>
      <h1 className={styles.title} style={{ fontSize: "clamp(36px, 5vw, 64px)" }}>
        {a.positionTitle}
      </h1>
      <p className={styles.rowMeta} style={{ marginBottom: 28 }}>
        Applied {dateTime.format(new Date(a.createdAt))} · {applicationLabel[a.status]}
      </p>

      {agreement && agreement.status === "issued" ? (
        <Link href={`/account/agreements/${agreement.id}`} className={styles.card} style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 20, borderColor: "rgba(167,250,67,.45)" }}>
          <FileSignature size={28} aria-hidden="true" style={{ color: "var(--green)", flex: "none" }} />
          <div>
            <p className={styles.rowTitle}>Your NDA is ready to sign</p>
            <p className={styles.rowMeta}>Read it in full, then sign. Available until {dateTime.format(new Date(agreement.expiresAt))}.</p>
          </div>
        </Link>
      ) : null}
      {agreement && agreement.status === "signed" ? (
        <p className={`${styles.notice} ${styles.noticeSuccess}`} style={{ marginBottom: 20 }}>
          NDA signed {agreement.signedAt ? dateTime.format(new Date(agreement.signedAt)) : ""}.{" "}
          <Link href={`/account/agreements/${agreement.id}`} style={{ textDecoration: "underline" }}>
            View or download your copy
          </Link>
        </p>
      ) : null}

      <div className={styles.split}>
        <section aria-label="Conversation">
          <div className={styles.thread}>
            {messages.length === 0 ? <p className={styles.rowMeta}>No messages yet. The team will be in touch here and in your Discord channel.</p> : null}
            {messages.map((m) => (
              <div key={m.id} className={`${styles.bubble} ${m.fromYou ? styles.bubbleMine : ""}`}>
                {m.content}
                <span className={styles.bubbleMeta}>
                  {m.fromYou ? "YOU" : "KUSH RECRUITMENT"} · {dateTime.format(new Date(m.createdAt)).toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          {!closed ? <RecruitMessageForm key={messages.length} applicationId={a.id} requestId={randomUUID()} /> : null}
        </section>

        <aside className={styles.form} style={{ maxWidth: "none" }}>
          <section className={styles.card} aria-labelledby="progress">
            <p id="progress" className={styles.cardLabel}>
              PROGRESS
            </p>
            {a.status === "rejected" || a.status === "withdrawn" ? (
              <p className={styles.cardValue}>{applicationLabel[a.status]}</p>
            ) : (
              <ol className={styles.timeline}>
                {applicationStages.map((stage, index) => (
                  <li
                    key={stage.status}
                    className={`${styles.stage} ${index < position || a.status === "activated" ? styles.stageDone : ""} ${index === position && a.status !== "activated" ? styles.stageCurrent : ""}`}
                    aria-current={index === position ? "step" : undefined}
                  >
                    <p className={styles.stageTitle}>
                      {index === position && (a.status === "more_info" || a.status === "interview") ? applicationLabel[a.status] : stage.label}
                    </p>
                    {index === position ? <p className={styles.stageText}>{stage.text}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
          {!closed ? (
            <section className={styles.card}>
              <p className={styles.cardLabel}>CHANGED YOUR MIND?</p>
              <WithdrawForm applicationId={a.id} />
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
