import type { ActionState } from "@/app/account/actions";

import styles from "./account.module.css";

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
        {state.success}
      </p>
    );
  return null;
}
