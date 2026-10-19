import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { categoryLabel,  commissionLabel, dateTime, milestoneLabel, type CommissionStatus, type Milestone, type Quote } from "@/lib/workspace";

interface Detail {
  id: string;
  title: string;
  details: string;
  category: string;
  status: CommissionStatus;
  version: number;
  approximateBudget: string | null;
  preferredTimeframe: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUserId: string | null;
  customerName: string;
  customerDiscordId: string | null;
  actions: { statuses: string[]; note: boolean; assign: boolean };
}

export default async function StaffCommission({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let c: Detail;
  let quotes: Quote[] = [];
  let milestones: Milestone[] = [];
  let ticketId: string | null = null;
  try {
    ({ commission: c, quotes, milestones, ticketId } = await kushApi<{
      commission: Detail;
      quotes: Quote[];
      milestones: Milestone[];
      ticketId: string | null;
    }>(`/web/staff/commissions/${id}`, { token: gate.token }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const team = c.actions.assign
    ? (await kushApi<{ team: { userId: string; name: string; roles: string[] }[] }>("/web/staff/team", { token: gate.token }))
        .team
    : [];
  const v = { requestId: c.id, expectedVersion: c.version };
  const openQuote = quotes.find((q) => q.status === "proposed");
  const acceptedQuote = quotes.find((q) => q.status === "accepted");

  return (
    <>
      <Link href="/staff/commissions" className={styles.rowMeta}>
        ← Commissions
      </Link>
      <div className={styles.headerRow} style={{ marginTop: 22 }}>
        <div>
          <p className={styles.kicker}>
            {categoryLabel(c.category).toUpperCase()} · {c.customerName.toUpperCase()}
          </p>
          <h1 className={styles.title} style={{ fontSize: "clamp(34px, 5vw, 58px)" }}>
            {c.title}
          </h1>
        </div>
        <span className={styles.badge} style={{ marginBottom: 18 }}>
          {commissionLabel[c.status].toUpperCase()}
        </span>
      </div>
      <p className={styles.rowMeta} style={{ marginBottom: 26 }}>
        Started {dateTime.format(new Date(c.createdAt))} · updated {dateTime.format(new Date(c.updatedAt))}
        {c.customerDiscordId ? ` · Discord ${c.customerDiscordId}` : ""}
      </p>

      <div className={styles.split}>
        <section className={styles.card} aria-labelledby="brief">
          <p id="brief" className={styles.cardLabel}>
            CUSTOMER BRIEF
          </p>
          <p className={styles.prose}>{c.details}</p>
          <div className={styles.row} style={{ marginTop: 22 }}>
            <span className={styles.rowMeta}>Budget</span>
            <span>{c.approximateBudget ?? "Not given"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMeta}>Timeframe</span>
            <span>{c.preferredTimeframe ?? "Not given"}</span>
          </div>
          <p className={styles.rowMeta} style={{ marginTop: 18 }}>
            No payments are taken here. Quotes and agreements are handled with the customer directly.
          </p>
        </section>

        <aside className={styles.form} style={{ maxWidth: "none" }} aria-label="Commission actions">
          {c.actions.statuses.length ? (
            <div className={styles.card} key={`status-${c.version}`}>
              <p className={styles.cardLabel}>MOVE TO</p>
              <ActionForm action="commission" hidden={v} submit="UPDATE" tone="plain">
                <select name="status" className={styles.input} required defaultValue="" aria-label="New status">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {c.actions.statuses.map((s) => (
                    <option key={s} value={s}>
                      {/* Leaving payment_pending means staff confirmed the deposit by hand. */}
                      {(c.status === "payment_pending" || c.status === "accepted") && s === "in_progress"
                        ? "Deposit received: start work"
                        : (commissionLabel[s as CommissionStatus] ?? s)}
                    </option>
                  ))}
                </select>
              </ActionForm>
              {c.status === "payment_pending" ? (
                <p className={styles.rowMeta} style={{ marginTop: 10 }}>
                  Payments aren&apos;t collected on the site yet. Only confirm the deposit once it has actually arrived;
                  this is recorded in the audit log.
                </p>
              ) : null}
            </div>
          ) : null}
          {c.actions.note ? (
            <div className={styles.card} key={`note-${c.version}`}>
              <p className={styles.cardLabel}>INTERNAL REVIEW NOTE</p>
              <ActionForm action="commission" hidden={v} submit="SAVE NOTE" tone="plain">
                <textarea
                  name="reviewNote"
                  className={styles.input}
                  rows={4}
                  maxLength={4000}
                  defaultValue={c.reviewNote ?? ""}
                  aria-label="Internal review note"
                />
                <p className={styles.rowMeta}>Staff only. Never shown to the customer.</p>
              </ActionForm>
            </div>
          ) : null}
          {c.actions.assign ? (
            <div className={styles.card} key={`assign-${c.version}`}>
              <p className={styles.cardLabel}>DEVELOPER</p>
              <ActionForm action="assignCommission" hidden={v} submit="ASSIGN" tone="plain">
                <select name="userId" className={styles.input} defaultValue={c.assignedUserId ?? ""} aria-label="Assignee">
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.roles.join(", ")})
                    </option>
                  ))}
                </select>
              </ActionForm>
            </div>
          ) : null}
        </aside>
      </div>

      <div className={styles.split} style={{ marginTop: 16 }}>
        <section className={styles.card} aria-labelledby="milestones">
          <p id="milestones" className={styles.cardLabel}>
            MILESTONES (VISIBLE TO THE CUSTOMER)
          </p>
          {milestones.length === 0 ? <p className={styles.rowMeta}>No milestones yet.</p> : null}
          {milestones.map((m) => (
            <div key={m.id} className={styles.row} style={{ padding: "10px 0" }}>
              <span>
                {m.title} <span className={styles.rowMeta}>· {milestoneLabel[m.status]}</span>
              </span>
              <ActionForm key={`${m.id}-${m.status}`} action="setMilestone" hidden={{ requestId: c.id, milestoneId: m.id }} submit="SET" tone="plain">
                <select name="status" className={styles.input} defaultValue={m.status} aria-label={`Status of ${m.title}`}>
                  {(["planned", "in_progress", "done"] as const).map((st) => (
                    <option key={st} value={st}>
                      {milestoneLabel[st]}
                    </option>
                  ))}
                </select>
              </ActionForm>
            </div>
          ))}
          <div key={`add-${milestones.length}`} style={{ marginTop: 12 }}>
            <ActionForm action="addMilestone" hidden={{ requestId: c.id }} submit="ADD MILESTONE" tone="plain">
              <input name="title" className={styles.input} required minLength={2} maxLength={120} placeholder="e.g. Homepage design approved" aria-label="Milestone title" />
            </ActionForm>
          </div>
          {ticketId ? (
            <p className={styles.rowMeta} style={{ marginTop: 16 }}>
              Conversation: <Link href={`/staff/tickets/${ticketId}`} style={{ textDecoration: "underline" }}>open the linked ticket</Link>
            </p>
          ) : null}
        </section>

        <aside className={styles.form} style={{ maxWidth: "none" }} aria-label="Quotes">
          {c.actions.note ? (
            <div className={styles.card} key={`quote-${c.version}`}>
              <p className={styles.cardLabel}>QUOTE</p>
              {openQuote ? (
                <>
                  <p className={styles.cardValue}>{openQuote.amount}</p>
                  <p className={styles.rowMeta}>Waiting for the customer to accept or decline.</p>
                  <ActionForm action="withdrawQuote" hidden={{ requestId: c.id, quoteId: openQuote.id }} submit="WITHDRAW QUOTE" tone="danger" />
                </>
              ) : c.status === "reviewing" || c.status === "awaiting_customer" ? (
                <ActionForm action="proposeQuote" hidden={{ requestId: c.id }} submit="SEND QUOTE">
                  <input name="price" className={styles.input} required inputMode="decimal" pattern="£?\s*\d{1,6}(\.\d{1,2})?" placeholder="Price in £, e.g. 120" aria-label="Price in pounds" />
                  <textarea name="summary" className={styles.input} rows={3} required minLength={10} maxLength={5000} placeholder="Summary: what you'll build" aria-label="Quote summary" />
                  <textarea name="deliverables" className={styles.input} rows={3} maxLength={4000} placeholder="Deliverables (optional), one per line" aria-label="Deliverables" />
                  <div className={styles.formRow}>
                    <input name="revisions" type="number" min={0} max={50} className={styles.input} placeholder="Revision rounds" aria-label="Revision rounds" />
                    <input name="expiresInDays" type="number" min={1} max={90} defaultValue={14} className={styles.input} aria-label="Quote valid for (days)" title="Quote valid for (days)" />
                  </div>
                  <input name="timeframe" className={styles.input} maxLength={200} placeholder="Timeframe (optional)" aria-label="Timeframe" />
                  <input name="optionalServices" className={styles.input} maxLength={2000} placeholder="Optional extras they can add (optional)" aria-label="Optional extras" />
                  <p className={styles.rowMeta}>The customer accepts it, then pays this price through Stripe from their account.</p>
                </ActionForm>
              ) : (
                <p className={styles.rowMeta}>Move the commission to “Under review” to send a quote.</p>
              )}
            </div>
          ) : null}
          {acceptedQuote && ["payment_pending", "accepted"].includes(c.status) && has(gate.me, "payments.manage") ? (
            <div className={styles.card} key={`paid-${c.version}`}>
              <p className={styles.cardLabel}>PAID ANOTHER WAY?</p>
              <p className={styles.rowMeta}>
                Only if the customer paid {acceptedQuote.amount} outside Stripe (e.g. bank transfer) and the money has
                arrived. It&apos;s recorded as an offline payment and audited.
              </p>
              <ActionForm
                action="offlinePayment"
                hidden={{ commissionId: c.id, quoteId: acceptedQuote.id, requestId: randomUUID() }}
                submit="RECORD PAYMENT"
                tone="plain"
              >
                <input
                  name="price"
                  className={styles.input}
                  required
                  defaultValue={acceptedQuote.amountPence ? (acceptedQuote.amountPence / 100).toString() : ""}
                  placeholder="Amount received in £"
                  aria-label="Amount received in pounds"
                />
                <input name="note" className={styles.input} required minLength={3} maxLength={500} placeholder="How it was paid, reference" aria-label="Payment note" />
                <label className={styles.rowMeta}>
                  <input type="checkbox" name="confirm" value="yes" /> The money is in the account
                </label>
              </ActionForm>
            </div>
          ) : null}
          {quotes.filter((q) => q.status !== "proposed").map((q) => (
            <div key={q.id} className={styles.card}>
              <p className={styles.cardLabel}>PAST QUOTE · {q.status.toUpperCase()}</p>
              <p className={styles.rowTitle}>{q.amount}</p>
              <p className={styles.rowMeta}>
                {dateTime.format(new Date(q.createdAt))}
                {q.declineReason ? ` · “${q.declineReason}”` : ""}
              </p>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
