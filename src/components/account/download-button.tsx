"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";

import { startDownload } from "@/app/account/actions";

import styles from "./account.module.css";

export default function DownloadButton({ fileId }: { fileId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending} onClick={() => start(() => startDownload(fileId))}>
      <Download size={14} aria-hidden="true" />
      {pending ? "PREPARING…" : "DOWNLOAD"}
    </button>
  );
}
