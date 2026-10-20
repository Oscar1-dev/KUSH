import Link from "next/link";

import styles from "@/components/account/account.module.css";
import { creditLabel, money, type CreditEntry } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime } from "@/lib/workspace";

export const metadata = { title: "Store credit" };

export default async function CreditPage() {
  const { token } = await requireAccount();
  const { balancePence, history, spendable } = await kushApi<{
    balancePence: number;
    history: CreditEntry[];
    spendable?: boolean;
  }>(
    "/web/workspace/credit",
    { token },
  );

  return (
    <>
      <p className={styles.kicker}>STORE CREDIT</p>
      <h1 className={styles.title}>
        {money(balancePence)} <em>{spendable ? "to spend." : "in credit."}</em>
      </h1>
      <p className={styles.lede}>
        Credit comes from <Link href="/account/referrals">referral rewards</Link>, refunds paid back as credit, or
        the KUSH team.{" "}
        {spendable
          ? "It's used automatically at checkout and can't be exchanged for cash."
          : "It's recorded on your account; spending it at checkout isn't switched on yet. It can't be exchanged for cash."}
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>History</h2>
        {history.length === 0 ? (
          <p className={styles.cardText}>No credit activity yet.</p>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className={styles.row}>
              <span>
                {creditLabel[entry.kind]}
                {entry.reference ? ` · ${entry.reference}` : ""}
                <span className={styles.rowMeta} style={{ display: "block" }}>
                  {dateTime.format(new Date(entry.createdAt))}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <strong style={{ color: entry.amountPence > 0 ? "var(--green)" : undefined }}>
                  {entry.amountPence > 0 ? "+" : "−"}
                  {money(Math.abs(entry.amountPence))}
                </strong>
                <span className={styles.rowMeta} style={{ display: "block" }}>
                  balance {money(entry.balanceAfterPence)}
                </span>
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
