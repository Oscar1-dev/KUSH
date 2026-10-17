"use client";

import { useActionState } from "react";

import { updateDisplayName, type ActionState } from "@/app/account/actions";

import { FormMessage } from "./form-message";
import styles from "./account.module.css";

export default function DisplayNameForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateDisplayName, {});
  return (
    <form action={action} className={styles.form}>
      <label className={styles.label} htmlFor="displayName">
        SHOWN AS
      </label>
      <input
        id="displayName"
        name="displayName"
        className={styles.input}
        defaultValue={initial}
        maxLength={40}
        autoComplete="nickname"
        placeholder="Leave empty to use your Discord name"
      />
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "SAVING…" : "SAVE"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
