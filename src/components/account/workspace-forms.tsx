"use client";

import { useActionState } from "react";

import type { ActionState } from "@/app/account/actions";
import { createCommission, createTicket, decideQuote, replyToTicket } from "@/app/account/workspace-actions";
import { commissionCategories } from "@/lib/workspace";

import { FormMessage } from "./form-message";
import styles from "./account.module.css";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <span className={styles.rowMeta} id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function CommissionForm({
  requestId,
  service,
  tier,
}: {
  requestId: string;
  /** Pre-selected from a service page or the Discord-style catalogue. */
  service?: string;
  tier?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCommission, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 680 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className={styles.formRow}>
        <div style={{ flex: "2 1 260px" }}>
          <Field id="category" label="SERVICE">
            <select id="category" name="category" className={styles.input} required defaultValue={service ?? ""}>
              <option value="" disabled>
                Choose a service
              </option>
              {commissionCategories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <Field id="serviceTier" label="SIZE (OPTIONAL)">
            <select id="serviceTier" name="serviceTier" className={styles.input} defaultValue={tier ?? ""}>
              <option value="">Not sure yet</option>
              <option value="starter">Starter (small job)</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium (full project)</option>
            </select>
          </Field>
        </div>
      </div>
      <Field id="title" label="PROJECT NAME">
        <input id="title" name="title" className={styles.input} required minLength={3} maxLength={200} placeholder="e.g. Portfolio for my photography" />
      </Field>
      <Field id="details" label="REQUIREMENTS" hint="What it needs to do, who it's for, features you want. At least 20 characters.">
        <textarea
          id="details"
          name="details"
          className={styles.input}
          required
          minLength={20}
          maxLength={10000}
          rows={8}
          aria-describedby="details-hint"
        />
      </Field>
      <div className={styles.formRow}>
        <div style={{ flex: "1 1 200px" }}>
          <Field id="approximateBudget" label="BUDGET (OPTIONAL)">
            <input id="approximateBudget" name="approximateBudget" className={styles.input} maxLength={120} placeholder="e.g. £150–£300" />
          </Field>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <Field id="preferredTimeframe" label="DEADLINE (OPTIONAL)">
            <input id="preferredTimeframe" name="preferredTimeframe" className={styles.input} maxLength={200} placeholder="e.g. Before 1 March, or no rush" />
          </Field>
        </div>
      </div>
      <Field id="referenceLinks" label="REFERENCES (OPTIONAL)" hint="Links to sites, designs or files you like. One per line.">
        <textarea id="referenceLinks" name="referenceLinks" className={styles.input} maxLength={2000} rows={3} aria-describedby="referenceLinks-hint" />
      </Field>
      <Field id="contactPreference" label="BEST WAY TO REACH YOU (OPTIONAL)" hint="We'll reply in your account and Discord either way. Never send passwords or card details.">
        <input
          id="contactPreference"
          name="contactPreference"
          className={styles.input}
          maxLength={200}
          placeholder="e.g. Discord DMs, or an email address"
          aria-describedby="contactPreference-hint"
        />
      </Field>
      <p className={styles.rowMeta}>
        This is a request, not an order. Nothing is charged: you&apos;ll get a written quote first, and work only starts
        once you accept it.
      </p>
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "SENDING…" : "SEND REQUEST"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function TicketForm({
  requestId,
  categories,
}: {
  requestId: string;
  categories: { key: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTicket, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 640 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <Field id="ticket-category" label="WHAT IS IT ABOUT?">
        <select id="ticket-category" name="category" className={styles.input} required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="description" label="DESCRIBE THE ISSUE" hint="Never include passwords or payment card details.">
        <textarea
          id="description"
          name="description"
          className={styles.input}
          required
          minLength={10}
          maxLength={10000}
          rows={7}
          aria-describedby="description-hint"
        />
      </Field>
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "OPENING…" : "OPEN TICKET"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ReplyForm({
  ticketId,
  version,
  requestId,
}: {
  ticketId: string;
  version: number;
  requestId: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(replyToTicket, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 720 }}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className={styles.label} htmlFor="reply">
        REPLY
      </label>
      <textarea id="reply" name="content" className={styles.input} required maxLength={10000} rows={4} />
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "SENDING…" : "SEND REPLY"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function QuoteDecision({ requestId, quoteId }: { requestId: string; quoteId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideQuote, {});
  return (
    <div className={styles.form} style={{ maxWidth: "none" }}>
      <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="decision" value="accept" />
        <label className={styles.rowMeta}>
          <input type="checkbox" name="confirm" value="yes" /> I accept this quote. I understand no payment is taken on
          the website; the team will confirm next steps.
        </label>
        <div className={styles.formRow}>
          <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
            ACCEPT QUOTE
          </button>
        </div>
      </form>
      <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="decision" value="decline" />
        <input name="reason" className={styles.input} maxLength={2000} placeholder="Why not? (optional, helps us re-quote)" aria-label="Reason for declining" />
        <div className={styles.formRow}>
          <button className={`${styles.button} ${styles.buttonDanger}`} disabled={pending}>
            DECLINE
          </button>
        </div>
      </form>
      <FormMessage state={state} />
    </div>
  );
}
