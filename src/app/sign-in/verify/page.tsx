import type { Metadata } from "next";
import { redirect } from "next/navigation";

import VerifyForm from "@/components/account/verify-form";
import styles from "@/components/account/account.module.css";
import { requireAccount } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Two-factor check — KUSH®",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const { account } = await requireAccount({ allowUnverified: true });
  if (!account.mfa.enabled || account.session.mfaVerified) redirect("/account");

  return (
    <main className={styles.signIn}>
      <div className={styles.signInOrbit} aria-hidden="true" />
      <section className={styles.signInPanel} aria-labelledby="verify-title">
        <p className={styles.kicker}>TWO-FACTOR CHECK</p>
        <h1 id="verify-title" className={styles.title}>
          One more <em>step.</em>
        </h1>
        <p className={styles.lede} style={{ marginBottom: 24 }}>
          Enter the 6-digit code from your authenticator app, or one of your
          recovery codes.
        </p>
        <VerifyForm />
      </section>
    </main>
  );
}
