"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { signOut } from "@/app/account/actions";

import styles from "./account.module.css";

export default function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={styles.button}
      disabled={pending}
      onClick={() => start(() => signOut("this"))}
    >
      <LogOut size={14} aria-hidden="true" />
      {pending ? "SIGNING OUT…" : "SIGN OUT"}
    </button>
  );
}
