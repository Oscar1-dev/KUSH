import type { Metadata } from "next";
import Link from "next/link";

import AccountNav from "@/components/account/account-nav";
import { Avatar } from "@/components/account/avatar";
import SignOutButton from "@/components/account/sign-out-button";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Account — KUSH®",
  robots: { index: false },
};

// Every account page is per-user; never cache or prerender.
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { account } = await requireAccount();
  const name = account.displayName ?? "KUSH member";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="KUSH home">
          K<span>U</span>SH
          <span className={styles.brandTag}>ACCOUNT</span>
        </Link>
        <AccountNav />
        <div className={styles.sidebarFoot}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <Avatar account={account} size={36} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--cream)", fontWeight: 700 }}>
              {name}
            </span>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className={styles.main} id="main">
        {children}
      </main>
    </div>
  );
}
