import { randomUUID } from "node:crypto";
import Link from "next/link";

import { CommissionForm } from "@/components/account/workspace-forms";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

export default async function NewCommissionPage() {
  await requireAccount();
  return (
    <>
      <Link href="/account/commissions" className={styles.rowMeta}>
        ← My commissions
      </Link>
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        NEW COMMISSION
      </p>
      <h1 className={styles.title}>
        Tell us what to <em>build.</em>
      </h1>
      <p className={styles.lede}>
        The more detail, the better the quote. You can add more later in a reply.
      </p>
      <CommissionForm requestId={randomUUID()} />
    </>
  );
}
