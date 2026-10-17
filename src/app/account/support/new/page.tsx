import { randomUUID } from "node:crypto";
import Link from "next/link";

import { TicketForm } from "@/components/account/workspace-forms";
import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";

export default async function NewTicketPage() {
  const { token } = await requireAccount();
  const { categories } = await kushApi<{ categories: { key: string; label: string }[] }>(
    "/web/workspace/ticket-categories",
    { token },
  );
  return (
    <>
      <Link href="/account/support" className={styles.rowMeta}>
        ← Support tickets
      </Link>
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        NEW TICKET
      </p>
      <h1 className={styles.title}>
        How can we <em>help?</em>
      </h1>
      <p className={styles.lede}>A KUSH team member will reply here. You can follow up from Discord too.</p>
      <TicketForm requestId={randomUUID()} categories={categories} />
    </>
  );
}
