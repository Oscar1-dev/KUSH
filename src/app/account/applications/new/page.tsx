import { randomUUID } from "node:crypto";
import Link from "next/link";

import { ApplyForm } from "@/components/account/recruitment-forms";
import styles from "@/components/account/account.module.css";
import type { Position } from "@/lib/recruitment";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { account } = await requireAccount();
  const { positions } = await kushApi<{ positions: Position[] }>("/web/careers/positions");
  const requested = (await searchParams).position;
  const initial = positions.some((p) => p.key === requested) ? requested! : null;
  return (
    <>
      <Link href="/account/applications" className={styles.rowMeta}>
        ← Staff applications
      </Link>
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        APPLY
      </p>
      <h1 className={styles.title}>
        Tell us about <em>you.</em>
      </h1>
      <p className={styles.lede}>Answer honestly and in your own words. The team reads every application.</p>
      {positions.length === 0 ? (
        <p className={styles.notice}>There are no open positions right now.</p>
      ) : !account.discord ? (
        <p className={`${styles.notice} ${styles.noticeError}`}>Sign in with Discord to apply.</p>
      ) : (
        <ApplyForm requestId={randomUUID()} positions={positions} initialPosition={initial} defaultName={account.displayName ?? ""} />
      )}
    </>
  );
}
