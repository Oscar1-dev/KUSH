import Link from "next/link";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateTime } from "@/lib/workspace";

interface Template {
  id: string;
  key: string;
  version: string;
  title: string;
  status: "draft" | "active" | "retired";
  sha256: string;
  signedCount: number;
}
interface Signed {
  id: string;
  status: string;
  issuedAt: string;
  signedAt: string | null;
  legalName: string | null;
  version: string;
  applicationNumber: number | null;
  accountName: string | null;
}

export default async function StaffAgreements() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "agreements.manage")) return <p className={styles.lede}>Agreements are managed by administrators.</p>;
  const [{ templates }, { agreements }] = await Promise.all([
    kushApi<{ templates: Template[] }>("/web/staff/agreement-templates", { token: gate.token }),
    kushApi<{ agreements: Signed[] }>("/web/staff/agreements", { token: gate.token }),
  ]);

  return (
    <>
      <p className={styles.kicker}>AGREEMENTS</p>
      <h1 className={styles.title}>
        NDAs &amp; <em>records.</em>
      </h1>
      <p className={styles.lede}>
        Agreement texts are versioned and can&apos;t be edited once published. A version can only be issued after an
        administrator reviews and activates it. The bundled NDA is a draft pending professional legal review.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Versions</h2>
        {templates.map((t) => (
          <div key={t.id} className={styles.card} style={{ marginBottom: 12 }}>
            <div className={styles.headerRow}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {t.title} · {t.version}
                </p>
                <p className={styles.rowMeta}>
                  {t.signedCount} signed · text fingerprint <span className={styles.mono}>{t.sha256.slice(0, 16)}…</span>
                </p>
              </div>
              <span className={`${styles.badge} ${t.status === "active" ? styles.badgeOn : t.status === "draft" ? styles.badgeWarn : ""}`}>
                {t.status.toUpperCase()}
              </span>
            </div>
            {t.status === "draft" ? (
              <ActionForm action="templateStatus" hidden={{ templateId: t.id, status: "active" }} submit="ACTIVATE FOR SIGNING">
                <label className={styles.rowMeta}>
                  <input type="checkbox" name="confirm" value="yes" /> I have reviewed this text and approve it being issued for signature.
                  I understand it has not been reviewed by a solicitor.
                </label>
              </ActionForm>
            ) : t.status === "active" ? (
              <ActionForm action="templateStatus" hidden={{ templateId: t.id, status: "retired" }} submit="RETIRE" tone="danger" />
            ) : null}
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Issued and signed</h2>
        {agreements.length === 0 ? <p className={styles.rowMeta}>None yet.</p> : null}
        {agreements.map((g) => (
          <div key={g.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {g.legalName ?? g.accountName ?? "Unsigned"} · NDA {g.version}
              </p>
              <p className={styles.rowMeta}>
                Issued {dateTime.format(new Date(g.issuedAt))}
                {g.signedAt ? ` · signed ${dateTime.format(new Date(g.signedAt))}` : ""}
                {g.applicationNumber ? (
                  <>
                    {" "}· application #{g.applicationNumber}
                  </>
                ) : null}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={styles.badge}>{g.status.toUpperCase()}</span>
              {g.status === "signed" ? (
                <a href={`/staff/agreements/${g.id}/pdf`} className={styles.button}>
                  PDF
                </a>
              ) : null}
            </div>
          </div>
        ))}
        <p className={styles.rowMeta} style={{ marginTop: 18 }}>
          Retention: signed agreements are kept for the duration of the role plus six years, then reviewed for deletion.
          Every PDF download by staff is recorded in the <Link href="/staff/audit" style={{ textDecoration: "underline" }}>audit log</Link>.
        </p>
      </section>
    </>
  );
}
