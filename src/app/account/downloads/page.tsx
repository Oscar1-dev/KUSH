import { Download } from "lucide-react";

import DownloadButton from "@/components/account/download-button";
import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateOnly } from "@/lib/workspace";

interface File {
  id: string;
  product: string;
  filename: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default async function DownloadsPage() {
  const { token } = await requireAccount();
  const { files } = await kushApi<{ files: File[] }>("/web/account/downloads", { token });
  return (
    <>
      <p className={styles.kicker}>DOWNLOADS</p>
      <h1 className={styles.title}>
        Your <em>downloads.</em>
      </h1>
      <p className={styles.lede}>
        Files for products you own. Each download uses a private link that expires after five minutes, checked against
        your account every time.
      </p>
      {files.length === 0 ? (
        <div className={styles.empty}>
          <Download size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>Nothing to download yet</p>
          <p className={styles.emptyText}>When you own a KUSH product with downloads, they will be available here.</p>
        </div>
      ) : (
        files.map((f) => (
          <div key={f.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {f.product} · {f.version}
              </p>
              <p className={styles.rowMeta}>
                {f.filename} · {size(f.sizeBytes)} · {dateOnly.format(new Date(f.createdAt))} · SHA-256{" "}
                <span className={styles.mono}>{f.sha256.slice(0, 12)}…</span>
              </p>
            </div>
            <DownloadButton fileId={f.id} />
          </div>
        ))
      )}
    </>
  );
}
