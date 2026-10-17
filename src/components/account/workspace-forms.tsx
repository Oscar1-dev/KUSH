"use client";

import { useActionState } from "react";

import type { ActionState } from "@/app/account/actions";
import { createCommission, createTicket, replyToTicket } from "@/app/account/workspace-actions";
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

export function CommissionForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCommission, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 640 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <Field id="category" label="TYPE OF PROJECT">
        <select id="category" name="category" className={styles.input} required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {commissionCategories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="title" label="PROJECT NAME">
        <input id="title" name="title" className={styles.input} required minLength={3} maxLength={200} />
      </Field>
      <Field id="details" label="WHAT DO YOU NEED?" hint="Goals, features, examples you like, anything we should know. At least 20 characters.">
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
            <input id="approximateBudget" name="approximateBudget" className={styles.input} maxLength={120} placeholder="e.g. £500–£1,000" />
          </Field>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <Field id="preferredTimeframe" label="TIMEFRAME (OPTIONAL)">
            <input id="preferredTimeframe" name="preferredTimeframe" className={styles.input} maxLength={200} placeholder="e.g. Within 6 weeks" />
          </Field>
        </div>
      </div>
      <p className={styles.rowMeta}>
        This is an enquiry, not an order. Nothing is charged; the team will review it and send a quote.
      </p>
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "SENDING…" : "SEND ENQUIRY"}
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
