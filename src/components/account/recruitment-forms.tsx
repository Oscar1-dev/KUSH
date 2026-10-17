"use client";

import { useActionState, useState } from "react";

import type { ActionState } from "@/app/account/actions";
import {
  applyForStaff,
  messageRecruiters,
  signAgreement,
  withdrawApplication,
} from "@/app/account/recruitment-actions";
import type { Position } from "@/lib/recruitment";

import { FormMessage } from "./form-message";
import styles from "./account.module.css";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
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

export function ApplyForm({
  requestId,
  positions,
  initialPosition,
  defaultName,
}: {
  requestId: string;
  positions: Position[];
  initialPosition: string | null;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyForStaff, {});
  const [positionKey, setPositionKey] = useState(initialPosition ?? "");
  const position = positions.find((p) => p.key === positionKey);
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 680 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <Field id="positionKey" label="POSITION">
        <select
          id="positionKey"
          name="positionKey"
          className={styles.input}
          required
          value={positionKey}
          onChange={(e) => setPositionKey(e.target.value)}
        >
          <option value="" disabled>
            Choose a position
          </option>
          {positions.map((p) => (
            <option key={p.key} value={p.key}>
              {p.title}
            </option>
          ))}
        </select>
      </Field>
      <div className={styles.formRow}>
        <div style={{ flex: "1 1 240px" }}>
          <Field id="preferredName" label="PREFERRED NAME">
            <input id="preferredName" name="preferredName" className={styles.input} required maxLength={80} defaultValue={defaultName} autoComplete="nickname" />
          </Field>
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <Field id="email" label="EMAIL ADDRESS" hint="Only the recruitment team sees this.">
            <input id="email" name="email" type="email" className={styles.input} required maxLength={254} autoComplete="email" aria-describedby="email-hint" />
          </Field>
        </div>
      </div>
      <Field id="experience" label="RELEVANT EXPERIENCE" hint="What have you done that prepares you for this role? At least 20 characters.">
        <textarea id="experience" name="experience" className={styles.input} rows={5} required minLength={20} maxLength={5000} aria-describedby="experience-hint" />
      </Field>
      <Field id="skills" label="SKILLS AND QUALIFICATIONS">
        <textarea id="skills" name="skills" className={styles.input} rows={3} required minLength={5} maxLength={3000} />
      </Field>
      <Field id="availability" label="AVAILABILITY" hint="e.g. Weekday evenings and Sundays, UK time.">
        <input id="availability" name="availability" className={styles.input} required minLength={2} maxLength={500} aria-describedby="availability-hint" />
      </Field>
      <Field id="motivation" label="WHY KUSH?" hint="At least 20 characters.">
        <textarea id="motivation" name="motivation" className={styles.input} rows={4} required minLength={20} maxLength={3000} aria-describedby="motivation-hint" />
      </Field>
      <Field
        id="portfolioUrl"
        label={position?.portfolioRequired ? "PORTFOLIO OR CODE (REQUIRED)" : "PORTFOLIO OR PREVIOUS WORK (OPTIONAL)"}
        hint="A link, e.g. https://github.com/you or a portfolio site."
      >
        <input
          id="portfolioUrl"
          name="portfolioUrl"
          type="url"
          className={styles.input}
          maxLength={500}
          required={Boolean(position?.portfolioRequired)}
          placeholder="https://"
          aria-describedby="portfolioUrl-hint"
        />
      </Field>
      <p className={styles.rowMeta}>
        Your application is linked to your Discord account. A private channel with the recruitment team opens in the
        KUSH Discord. Being accepted never happens automatically, and every step is reviewed by a person.
      </p>
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "SENDING…" : "SUBMIT APPLICATION"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RecruitMessageForm({ applicationId, requestId }: { applicationId: string; requestId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(messageRecruiters, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 720 }}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className={styles.label} htmlFor="app-message">
        MESSAGE THE RECRUITMENT TEAM
      </label>
      <textarea id="app-message" name="content" className={styles.input} rows={3} required maxLength={5000} />
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "SENDING…" : "SEND"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function WithdrawForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(withdrawApplication, {});
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className={styles.rowMeta}>
        <input type="checkbox" name="confirm" value="yes" required /> I want to withdraw this application
      </label>
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonDanger}`} disabled={pending}>
          {pending ? "WITHDRAWING…" : "WITHDRAW"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function SignForm({
  agreementId,
  statement,
  bodySha256,
  defaultEmail,
}: {
  agreementId: string;
  statement: string;
  bodySha256: string;
  defaultEmail: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signAgreement, {});
  const [legalName, setLegalName] = useState("");
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const matches = legalName.trim().length > 1 && legalName.trim().toLowerCase() === signature.trim().toLowerCase();
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 640 }}>
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="statement" value={statement} />
      <input type="hidden" name="bodySha256" value={bodySha256} />
      <Field id="legalName" label="FULL LEGAL NAME">
        <input id="legalName" name="legalName" className={styles.input} required minLength={2} maxLength={120} autoComplete="name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
      </Field>
      <Field id="sign-email" label="EMAIL ADDRESS">
        <input id="sign-email" name="email" type="email" className={styles.input} required maxLength={254} autoComplete="email" defaultValue={defaultEmail} />
      </Field>
      <Field id="signature" label="ELECTRONIC SIGNATURE" hint="Type your full legal name again, exactly as above.">
        <input
          id="signature"
          name="signature"
          className={styles.input}
          required
          maxLength={120}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive", fontSize: 26 }}
          aria-describedby="signature-hint"
        />
      </Field>
      {signature && !matches ? <p className={styles.rowMeta}>Your signature must match your full legal name.</p> : null}
      <label className={styles.notice} style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" name="accept" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          <strong>I ACCEPT.</strong> {statement}
        </span>
      </label>
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending || !accepted || !matches}>
          {pending ? "SIGNING…" : "SIGN AGREEMENT"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
