"use client";

import { useTransition } from "react";

import { revokeSession, signOut } from "@/app/account/actions";

import styles from "./account.module.css";

export default function SessionActions(
  props: { sessionId: string; everywhere?: never } | { everywhere: true; sessionId?: never },
) {
  const [pending, start] = useTransition();
  if (props.everywhere)
    return (
      <>
        <button
          type="button"
          className={styles.button}
          disabled={pending}
          onClick={() => start(() => signOut("others"))}
        >
          SIGN OUT OTHER DEVICES
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonDanger}`}
          disabled={pending}
          onClick={() => start(() => signOut("all"))}
        >
          SIGN OUT EVERYWHERE
        </button>
      </>
    );
  return (
    <button
      type="button"
      className={`${styles.button} ${styles.buttonDanger}`}
      disabled={pending}
      onClick={() => start(() => revokeSession(props.sessionId))}
    >
      {pending ? "SIGNING OUT…" : "SIGN OUT"}
    </button>
  );
}
