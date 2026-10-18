import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { applicationLabel, type Application, type ApplicationStatus } from "@/lib/recruitment";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireStaff, roleLabel, type StaffRole } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface Detail {
  application: Application & {
    reviewNote: string | null;
    discordUserId: string;
    approvedStaffRole: StaffRole | null;
    positionStaffRole: StaffRole;
  };
  messages: { id: string; kind: "message" | "note"; content: string; createdAt: string; fromApplicant: boolean; authorName: string }[];
  events: { from: string | null; to: ApplicationStatus; note: string | null; createdAt: string; actorName: string | null }[];
  agreements: { id: string; status: string; issuedAt: string; signedAt: string | null; legalName: string | null; version: string }[];
  actions: {
    moves: ApplicationStatus[];
    issueNda: boolean;
    approve: boolean;
    activate: boolean;
    approvableRoles: StaffRole[];
  };
}

const answers: [keyof Application, string][] = [
  ["experience", "Experience"],
  ["skills", "Skills and qualifications"],
  ["availability", "Availability"],
  ["motivation", "Motivation"],
];

export default async function StaffApplication({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let d: Detail;
  try {
    d = await kushApi<Detail>(`/web/staff/applications/${id}`, { token: gate.token });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
  const a = d.application;
  const v = { applicationId: a.id, expectedVersion: a.version };

  return (
    <>
      <Link href="/staff/applications" className={styles.rowMeta}>
        ← Applications
      </Link>
      <div className={styles.headerRow} style={{ marginTop: 22 }}>
        <div>
          <p className={styles.kicker}>
            APPLICATION #{a.number} · {a.positionTitle.toUpperCase()}
          </p>
          <h1 className={styles.title} style={{ fontSize: "clamp(34px, 5vw, 58px)" }}>
            {a.preferredName}
          </h1>
        </div>
        <span className={styles.badge} style={{ marginBottom: 18 }}>
          {applicationLabel[a.status].toUpperCase()}
        </span>
      </div>
      <p className={styles.rowMeta} style={{ marginBottom: 26 }}>
        {a.email} · Discord {a.discordUserId} · applied {dateTime.format(new Date(a.createdAt))}
        {a.discordChannelId ? " · private channel open" : " · channel pending"}
      </p>

      <div className={styles.split}>
        <section>
          <div className={styles.card} style={{ marginBottom: 16 }}>
            {answers.map(([key, label]) => (
              <div key={key} style={{ marginBottom: 18 }}>
                <p className={styles.cardLabel}>{label.toUpperCase()}</p>
                <p className={styles.prose}>{String(a[key])}</p>
              </div>
            ))}
            {a.portfolioUrl ? (
              <p className={styles.rowMeta}>
                Portfolio:{" "}
                <a href={a.portfolioUrl} rel="noopener noreferrer nofollow" target="_blank" style={{ textDecoration: "underline", color: "var(--cream)" }}>
                  {a.portfolioUrl}
                </a>
              </p>
            ) : null}
          </div>

          <div className={styles.thread} aria-label="Conversation">
            {d.messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.bubble} ${m.fromApplicant ? "" : styles.bubbleMine}`}
                style={m.kind === "note" ? { borderStyle: "dashed", borderColor: "rgba(147,99,238,.6)", background: "rgba(147,99,238,.07)" } : undefined}
              >
                {m.content}
                <span className={styles.bubbleMeta}>
                  {m.kind === "note" ? "INTERNAL NOTE · " : ""}
                  {(m.fromApplicant ? "APPLICANT" : m.authorName).toUpperCase()} · {dateTime.format(new Date(m.createdAt)).toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.card} key={`msg-${d.messages.length}`}>
            <ActionForm action="applicationMessage" hidden={{ applicationId: a.id, requestId: randomUUID() }} submit="SEND">
              <label className={styles.label} htmlFor="app-content">
                MESSAGE
              </label>
              <textarea id="app-content" name="content" className={styles.input} rows={3} required maxLength={5000} />
              <div className={styles.formRow} role="radiogroup" aria-label="Who can see this">
                <label className={styles.rowMeta}>
                  <input type="radio" name="kind" value="message" defaultChecked /> To the applicant (also posted in their Discord channel)
                </label>
                <label className={styles.rowMeta}>
                  <input type="radio" name="kind" value="note" /> Internal note
                </label>
              </div>
            </ActionForm>
          </div>
        </section>

        <aside className={styles.form} style={{ maxWidth: "none" }} aria-label="Pipeline actions">
          {d.actions.moves.length ? (
            <div className={styles.card} key={`move-${a.version}`}>
              <p className={styles.cardLabel}>MOVE TO</p>
              <ActionForm action="applicationStatus" hidden={v} submit="UPDATE" tone="plain">
                <select name="status" className={styles.input} required defaultValue="" aria-label="New status">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {d.actions.moves.map((s) => (
                    <option key={s} value={s}>
                      {applicationLabel[s]}
                    </option>
                  ))}
                </select>
                <input name="note" className={styles.input} maxLength={2000} placeholder="Note for the record (optional)" aria-label="Note" />
              </ActionForm>
            </div>
          ) : null}
          {d.actions.issueNda ? (
            <div className={styles.card} key={`nda-${a.version}`}>
              <p className={styles.cardLabel}>NEXT: ISSUE NDA</p>
              <p className={styles.rowMeta}>Sends a secure link to the applicant&apos;s private channel. It expires in 14 days.</p>
              <ActionForm action="issueNda" hidden={v} submit="ISSUE NDA" />
            </div>
          ) : null}
          {d.actions.approve ? (
            <div className={styles.card} key={`approve-${a.version}`}>
              <p className={styles.cardLabel}>NEXT: IDENTITY &amp; ROLE APPROVAL</p>
              <ActionForm action="approveApplication" hidden={v} submit="APPROVE" tone="plain">
                {d.actions.approvableRoles.length === 1 ? (
                  <p className={styles.rowMeta}>Moderators don&apos;t need the NDA. Any role above Moderator needs a signed NDA first.</p>
                ) : null}
                <select
                  name="staffRole"
                  className={styles.input}
                  defaultValue={d.actions.approvableRoles.includes(a.positionStaffRole) ? a.positionStaffRole : d.actions.approvableRoles[0]}
                  aria-label="Role to grant"
                >
                  {d.actions.approvableRoles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel[r]}
                    </option>
                  ))}
                </select>
                <label className={styles.rowMeta}>
                  <input type="checkbox" name="confirm" value="yes" /> I have verified this person&apos;s identity
                </label>
              </ActionForm>
            </div>
          ) : null}
          {d.actions.activate ? (
            <div className={styles.card} key={`activate-${a.version}`} style={{ borderColor: "rgba(167,250,67,.45)" }}>
              <p className={styles.cardLabel}>NEXT: ACTIVATE</p>
              <p className={styles.rowMeta}>
                Grants the {a.approvedStaffRole ? roleLabel[a.approvedStaffRole] : ""} Discord role. Staff tools then follow from that live role, and the
                person must use 2FA.
              </p>
              <ActionForm action="activateApplication" hidden={v} submit="ACTIVATE STAFF ACCESS">
                <label className={styles.rowMeta}>
                  <input type="checkbox" name="confirm" value="yes" /> Grant the role now
                </label>
              </ActionForm>
            </div>
          ) : null}

          <div className={styles.card} key={`note-${a.version}`}>
            <p className={styles.cardLabel}>REVIEW NOTE (STAFF ONLY)</p>
            <ActionForm action="applicationNote" hidden={{ applicationId: a.id }} submit="SAVE" tone="plain">
              <textarea name="reviewNote" className={styles.input} rows={3} maxLength={5000} defaultValue={a.reviewNote ?? ""} aria-label="Review note" />
            </ActionForm>
          </div>

          {d.agreements.length ? (
            <div className={styles.card}>
              <p className={styles.cardLabel}>AGREEMENTS</p>
              {d.agreements.map((g) => (
                <div key={g.id} className={styles.row} style={{ padding: "10px 0" }}>
                  <span className={styles.rowMeta}>
                    NDA {g.version} · {g.status}
                    {g.signedAt ? ` · ${g.legalName}` : ""}
                  </span>
                  {g.status === "signed" ? (
                    <a href={`/staff/agreements/${g.id}/pdf`} className={styles.button}>
                      PDF
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.card}>
            <p className={styles.cardLabel}>HISTORY</p>
            {d.events.map((e, i) => (
              <p key={i} className={styles.rowMeta} style={{ margin: "0 0 8px" }}>
                {dateTime.format(new Date(e.createdAt))} · {applicationLabel[e.to]}
                {e.actorName ? ` · ${e.actorName}` : ""}
                {e.note ? ` · “${e.note}”` : ""}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
