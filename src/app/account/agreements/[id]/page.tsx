import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { SignForm } from "@/components/account/recruitment-forms";
import styles from "@/components/account/account.module.css";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime } from "@/lib/workspace";

interface Agreement {
  id: string;
  status: "issued" | "signed" | "voided" | "expired";
  expired: boolean;
  issuedAt: string;
  expiresAt: string;
  signedAt: string | null;
  legalName: string | null;
  email: string | null;
  signature: string | null;
  title: string;
  version: string;
  body: string;
  sha256: string;
  acceptanceStatement: string;
}

export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await requireAccount();
  const { id } = await params;
  const { signed: justSigned } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let g: Agreement;
  try {
    g = await kushApi<Agreement>(`/web/agreements/${id}`, { token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const open = g.status === "issued" && !g.expired;

  return (
    <>
      <Link href="/account/applications" className={styles.rowMeta}>
        ← Staff applications
      </Link>
      {justSigned ? (
        <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status" style={{ marginTop: 20 }}>
          Signed. Thank you. Download your copy below. The team will now confirm your role.
        </p>
      ) : null}
      <p className={styles.kicker} style={{ marginTop: 22 }}>
        AGREEMENT · VERSION {g.version.toUpperCase()}
      </p>
      <h1 className={styles.title} style={{ fontSize: "clamp(34px, 5vw, 58px)" }}>
        {g.title}
      </h1>
      <p className={styles.rowMeta} style={{ marginBottom: 20 }}>
        Issued {dateTime.format(new Date(g.issuedAt))}
        {g.status === "issued" ? ` · sign by ${dateTime.format(new Date(g.expiresAt))}` : ""}
        {g.signedAt ? ` · signed ${dateTime.format(new Date(g.signedAt))}` : ""}
      </p>

      <p className={`${styles.notice} ${styles.badgeWarn}`} style={{ marginBottom: 18 }}>
        This agreement is a draft prepared by KUSH and is pending professional legal review. Read it carefully, and
        ask the team in your application channel if anything is unclear before signing.
      </p>

      <article
        className={styles.card}
        aria-label="Agreement text"
        tabIndex={0}
        style={{ maxHeight: 560, overflowY: "auto", marginBottom: 26 }}
      >
        <pre className={styles.prose} style={{ fontFamily: "inherit", fontSize: 14 }}>
          {g.body}
        </pre>
      </article>

      {open ? (
        <section className={styles.card} aria-labelledby="sign">
          <p id="sign" className={styles.cardLabel}>
            SIGN
          </p>
          <SignForm agreementId={g.id} statement={g.acceptanceStatement} bodySha256={g.sha256} defaultEmail={g.email ?? ""} />
        </section>
      ) : g.status === "signed" ? (
        <section className={styles.card}>
          <p className={styles.cardLabel}>SIGNED BY</p>
          <p className={styles.cardValue} style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive", fontWeight: 400 }}>
            {g.signature}
          </p>
          <p className={styles.rowMeta}>
            {g.legalName} · {g.email}
          </p>
          <a href={`/account/agreements/${g.id}/pdf`} className={`${styles.button} ${styles.buttonPrimary}`} style={{ marginTop: 18 }}>
            <Download size={14} aria-hidden="true" />
            DOWNLOAD SIGNED PDF
          </a>
        </section>
      ) : (
        <p className={styles.notice}>
          {g.status === "voided" ? "This agreement was withdrawn and can no longer be signed." : "This agreement has expired. Ask the team to issue a new one."}
        </p>
      )}
    </>
  );
}
