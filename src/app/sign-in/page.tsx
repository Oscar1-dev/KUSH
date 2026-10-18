import type { Metadata } from "next";
import Wordmark from "@/components/site/wordmark";
import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "@/components/account/account.module.css";
import { currentAccount, safeNext } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Sign in — KUSH®",
  robots: { index: false },
};

const messages: Record<string, string> = {
  cancelled: "Sign-in was cancelled on Discord.",
  expired: "That sign-in link expired or was opened in another browser. Please try again.",
  disabled: "This KUSH account is disabled. Contact KUSH support for help.",
  busy: "Too many sign-in attempts. Wait a minute and try again.",
  unconfigured: "Discord sign-in is not switched on yet. Please check back soon.",
  unavailable: "KUSH services are unavailable right now. Please try again shortly.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const account = await currentAccount().catch(() => null);
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (account) redirect(next ?? "/account");
  const error = typeof params.error === "string" ? messages[params.error] : undefined;

  return (
    <main className={styles.signIn}>
      <section className={styles.signInPanel} aria-labelledby="sign-in-title">
        <Link href="/" className={styles.brand} aria-label="KUSH home">
          <Wordmark height={34} />
        </Link>
        <p className={styles.kicker} style={{ marginTop: 34 }}>
          KUSH ACCOUNT
        </p>
        <h1 id="sign-in-title" className={styles.title}>
          Sign <em>in.</em>
        </h1>
        <p className={styles.lede} style={{ marginBottom: 28 }}>
          One account for the KUSH website, our Discord and future KUSH apps.
          New here? Signing in creates your account.
        </p>

        {error ? (
          <p className={`${styles.notice} ${styles.noticeError}`} role="alert" style={{ marginBottom: 20 }}>
            {error}
          </p>
        ) : null}
        {params["signed-out"] ? (
          <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status" style={{ marginBottom: 20 }}>
            You have been signed out.
          </p>
        ) : null}

        {/* A plain link: the server starts the OAuth flow and sets the binding cookie. */}
        <a href={next ? `/auth/discord?next=${encodeURIComponent(next)}` : "/auth/discord"} className={`${styles.button} ${styles.buttonDiscord}`} style={{ width: "100%" }}>
          <DiscordGlyph />
          CONTINUE WITH DISCORD
        </a>

        <p className={styles.fine}>
          We only ask Discord for your username and avatar. KUSH never sees
          your Discord password. Your Discord roles are kept in sync with what
          you own on KUSH.
        </p>
      </section>
    </main>
  );
}

function DiscordGlyph() {
  return (
    <svg width="20" height="15" viewBox="0 0 71 55" aria-hidden="true" fill="currentColor">
      <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.4 37.4 0 0 0 25.6.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.7-.9 32.2.3 45.5v.2a58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.9a.2.2 0 0 1 0 .4 36.3 36.3 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.2 47.2 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.6 58.6 0 0 0 17.7-9 .2.2 0 0 0 .1-.2c1.5-15.3-2.5-28.7-10.6-40.5a.2.2 0 0 0-.1-.1ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z" />
    </svg>
  );
}
