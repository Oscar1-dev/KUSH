import { randomUUID } from "node:crypto";
import Link from "next/link";

import { CommissionForm } from "@/components/account/workspace-forms";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";
import { commissionCategories } from "@/lib/workspace";

export default async function NewCommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; tier?: string }>;
}) {
  await requireAccount();
  const { service, tier } = await searchParams;
  const known = commissionCategories.some((c) => c.key === service);
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
        The more detail, the better the quote. You can add more later in a reply, here or in your private Discord channel.
      </p>
      <CommissionForm
        requestId={randomUUID()}
        service={known ? service : undefined}
        tier={tier && ["starter", "standard", "premium"].includes(tier) ? tier : undefined}
      />
    </>
  );
}
