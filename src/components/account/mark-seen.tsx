"use client";

import { useTransition } from "react";

import { markNotificationsSeen } from "@/app/account/actions";

import styles from "./account.module.css";

export default function MarkSeen() {
  const [pending, start] = useTransition();
  return (
    <div className={styles.formRow} style={{ marginTop: 18 }}>
      <button type="button" className={styles.button} disabled={pending} onClick={() => start(() => markNotificationsSeen())}>
        {pending ? "MARKING…" : "MARK ALL AS READ"}
      </button>
    </div>
  );
}
