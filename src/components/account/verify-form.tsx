"use client";

import { useActionState } from "react";

import { signOut, verifyMfa, type ActionState } from "@/app/account/actions";

import { FormMessage } from "./form-message";
import styles from "./account.module.css";

export default function VerifyForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(verifyMfa, {});
  return (
    <form action={action} className={styles.form}>
      <label className={styles.label} htmlFor="verify-code">
        CODE
      </label>
      <input
        id="verify-code"
        name="code"
        className={`${styles.input} ${styles.mono}`}
        style={{ fontSize: 20, letterSpacing: "0.2em" }}
        autoComplete="one-time-code"
        autoFocus
        required
        maxLength={16}
      />
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "CHECKING…" : "CONTINUE"}
        </button>
        <button type="button" className={styles.button} onClick={() => signOut("this")}>
          CANCEL
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
