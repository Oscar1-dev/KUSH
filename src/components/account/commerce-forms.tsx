"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";

import type { ActionState } from "@/app/account/actions";
import { buyProduct, payQuote, requestRevision, resumeOrder } from "@/app/account/commerce-actions";

import { FormMessage } from "./form-message";
import styles from "./account.module.css";

const secureNote = "Payment is handled by Stripe. KUSH never sees your card details.";

export function PayQuoteForm({
  commissionId,
  quoteId,
  requestId,
  amount,
  creditPence,
}: {
  commissionId: string;
  quoteId: string;
  requestId: string;
  amount: string;
  creditPence: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(payQuote, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="requestId" value={requestId} />
      {creditPence > 0 ? (
        <label className={styles.rowMeta}>
          <input type="checkbox" name="useCredit" value="yes" defaultChecked /> Use my store credit first
        </label>
      ) : null}
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          <Lock size={14} aria-hidden="true" />
          {pending ? "OPENING CHECKOUT…" : `PAY ${amount} SECURELY`}
        </button>
      </div>
      <p className={styles.fine}>{secureNote}</p>
      <FormMessage state={state} />
    </form>
  );
}

export function BuyProductForm({ productSlug, requestId, label }: { productSlug: string; requestId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(buyProduct, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: "none", gap: 8 }}>
      <input type="hidden" name="productSlug" value={productSlug} />
      <input type="hidden" name="requestId" value={requestId} />
      <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
        {pending ? "OPENING CHECKOUT…" : label}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function ResumeOrderForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resumeOrder, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
      <input type="hidden" name="orderId" value={orderId} />
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          <Lock size={14} aria-hidden="true" />
          {pending ? "OPENING CHECKOUT…" : "CONTINUE TO PAYMENT"}
        </button>
      </div>
      <p className={styles.fine}>{secureNote}</p>
      <FormMessage state={state} />
    </form>
  );
}

export function RevisionForm({ commissionId }: { commissionId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestRevision, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
      <input type="hidden" name="commissionId" value={commissionId} />
      <div className={styles.formRow}>
        <button className={styles.button} disabled={pending}>
          REQUEST CHANGES
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
