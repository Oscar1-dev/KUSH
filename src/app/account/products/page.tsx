import { Package } from "lucide-react";

import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateOnly } from "@/lib/workspace";

interface Entitlement {
  id: string;
  productSlug: string;
  productName: string;
  status: "active" | "revoked" | "refunded" | "expired";
  expiresAt: string | null;
  createdAt: string;
}

export default async function ProductsPage() {
  const { token } = await requireAccount();
  const { entitlements } = await kushApi<{ entitlements: Entitlement[] }>("/web/account/products", { token });
  return (
    <>
      <p className={styles.kicker}>MY PRODUCTS</p>
      <h1 className={styles.title}>
        Your <em>library.</em>
      </h1>
      <p className={styles.lede}>Everything you own from KUSH, with its licence status. Your Discord roles follow this list.</p>
      {entitlements.length === 0 ? (
        <div className={styles.empty}>
          <Package size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>No products yet</p>
          <p className={styles.emptyText}>
            KUSH has no products on sale yet. Anything you own in future will appear here and unlock in Discord automatically.
          </p>
        </div>
      ) : (
        entitlements.map((e) => (
          <div key={e.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>{e.productName}</p>
              <p className={styles.rowMeta}>
                Since {dateOnly.format(new Date(e.createdAt))}
                {e.expiresAt ? ` · until ${dateOnly.format(new Date(e.expiresAt))}` : " · no expiry"}
              </p>
            </div>
            <span className={`${styles.badge} ${e.status === "active" ? styles.badgeOn : ""}`}>{e.status.toUpperCase()}</span>
          </div>
        ))
      )}
    </>
  );
}
