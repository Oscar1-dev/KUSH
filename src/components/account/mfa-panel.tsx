"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import {
  beginTotp,
  disableTotp,
  enableTotp,
  regenerateRecoveryCodes,
  type ActionState,
} from "@/app/account/actions";

import { FormMessage } from "./form-message";
import styles from "./account.module.css";

function CodeInput({ id, label = "6-DIGIT CODE" }: { id: string; label?: string }) {
  return (
    <>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name="code"
        className={`${styles.input} ${styles.inputCode}`}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
      />
    </>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  return (
    <div className={styles.form} style={{ maxWidth: 520 }}>
      <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
        Save these recovery codes now. Each works once, and they are only
        shown this one time.
      </p>
      <div className={`${styles.codes} ${styles.mono}`} aria-label="Recovery codes">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.button}
          onClick={() =>
            navigator.clipboard
              .writeText(codes.join("\n"))
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? "COPIED" : "COPY CODES"}
        </button>
        <a
          className={styles.button}
          download="kush-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`KUSH recovery codes\n\n${codes.join("\n")}\n`)}`}
        >
          DOWNLOAD
        </a>
        <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => router.refresh()}>
          I&apos;VE SAVED THEM
        </button>
      </div>
    </div>
  );
}

function Enrol() {
  const [setup, setSetup] = useState<ActionState>({});
  const [starting, start] = useTransition();
  const [state, action, pending] = useActionState<ActionState, FormData>(enableTotp, {});
  const current = state.setup ?? setup.setup;

  if (state.recoveryCodes) return <RecoveryCodes codes={state.recoveryCodes} />;
  if (!current)
    return (
      <div className={styles.form}>
        <p className={styles.cardText} style={{ marginTop: 0 }}>
          Use an authenticator app such as Google Authenticator, Microsoft
          Authenticator, 1Password or Aegis. You will need a code from it when
          you sign in.
        </p>
        <div className={styles.formRow}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={starting}
            onClick={() => start(async () => setSetup(await beginTotp()))}
          >
            {starting ? "PREPARING…" : "SET UP 2FA"}
          </button>
        </div>
        <FormMessage state={setup} />
      </div>
    );

  return (
    <form action={action} className={styles.form} style={{ maxWidth: 560 }}>
      <p className={styles.cardText} style={{ marginTop: 0 }}>
        1. Scan this QR code with your authenticator app.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={current.qr} alt="QR code for your authenticator app" className={styles.qr} />
      <p className={styles.rowMeta}>
        Can&apos;t scan? Enter this key instead:{" "}
        <span className={styles.mono} style={{ color: "var(--cream)" }}>
          {current.secret.replace(/(.{4})/g, "$1 ").trim()}
        </span>
      </p>
      <p className={styles.cardText}>2. Enter the code it shows to switch 2FA on.</p>
      <CodeInput id="enable-code" />
      <div className={styles.formRow}>
        <button className={`${styles.button} ${styles.buttonPrimary}`} disabled={pending}>
          {pending ? "CHECKING…" : "TURN ON 2FA"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function Manage() {
  const [regen, regenAction, regenPending] = useActionState<ActionState, FormData>(regenerateRecoveryCodes, {});
  const [off, offAction, offPending] = useActionState<ActionState, FormData>(disableTotp, {});
  return (
    <>
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <p className={styles.cardLabel}>NEW RECOVERY CODES</p>
        {regen.recoveryCodes ? (
          <RecoveryCodes codes={regen.recoveryCodes} />
        ) : (
          <form action={regenAction} className={styles.form}>
            <p className={styles.cardText} style={{ marginTop: 0 }}>
              Replaces all your recovery codes. Confirm with a fresh code from your app.
            </p>
            <CodeInput id="regen-code" />
            <div className={styles.formRow}>
              <button className={styles.button} disabled={regenPending}>
                {regenPending ? "CHECKING…" : "CREATE NEW CODES"}
              </button>
            </div>
            <FormMessage state={regen} />
          </form>
        )}
      </div>
      <div className={styles.card}>
        <p className={styles.cardLabel}>TURN OFF 2FA</p>
        <form action={offAction} className={styles.form}>
          <p className={styles.cardText} style={{ marginTop: 0 }}>
            Makes your account less secure and signs out your other devices.
            Staff accounts cannot use staff tools without 2FA.
          </p>
          <CodeInput id="disable-code" />
          <div className={styles.formRow}>
            <button className={`${styles.button} ${styles.buttonDanger}`} disabled={offPending}>
              {offPending ? "CHECKING…" : "TURN OFF 2FA"}
            </button>
          </div>
          <FormMessage state={off} />
        </form>
      </div>
    </>
  );
}

export default function MfaPanel({ enabled }: { enabled: boolean }) {
  return enabled ? <Manage /> : <div className={styles.card}><Enrol /></div>;
}
