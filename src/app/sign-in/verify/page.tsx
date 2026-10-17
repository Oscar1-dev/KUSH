import type { Metadata } from "next";
import { redirect } from "next/navigation";

import VerifyForm from "@/components/account/verify-form";
import styles from "@/components/account/account.module.css";
import { requireAccount, safeNext } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Two-factor check — KUSH®",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  const { account } = await requireAccount({ allowUnverified: true });
  if (!account.mfa.enabled) redirect(next ? "/account/security" : "/account");
  // Staff re-confirm 2FA periodically even on a verified session.
  if (account.session.mfaVerified && !next?.startsWith("/staff")) redirect(next ?? "/account");

  return (
    <main className={styles.signIn}>
      <div className={styles.signInOrbit} aria-hidden="true" />
      <section className={styles.signInPanel} aria-labelledby="verify-title">
        <p className={styles.kicker}>TWO-FACTOR CHECK</p>
        <h1 id="verify-title" className={styles.title}>
          One more <em>step.</em>
        </h1>
        <p className={styles.lede} style={{ marginBottom: 24 }}>
          {next?.startsWith("/staff")
            ? "Staff tools need a recent two-factor check. Enter the code from your authenticator app."
            : "Enter the 6-digit code from your authenticator app, or one of your recovery codes."}
        </p>
        <VerifyForm next={next} />
      </section>
    </main>
  );
}
