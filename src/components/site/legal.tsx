import { PageHero } from "./blocks";
import pages from "./pages.module.css";
import site from "./site.module.css";

/**
 * Policy page frame. Every policy carries a visible review banner until the
 * owner (ideally with legal advice) has approved the wording; remove the
 * `draft` prop once it has been.
 */
export function PolicyPage({
  eyebrow,
  title,
  lede,
  updated,
  draft = true,
  children,
}: {
  eyebrow: string;
  title: [string, string];
  lede: string;
  updated: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} lede={lede} />
      <section className={site.section}>
        <div className="container">
          {draft ? (
            <p className={pages.review} role="note">
              <strong>DRAFT · OWNER REVIEW</strong>
              <span>
                This policy is a working draft written for KUSH and hasn&apos;t been reviewed by a solicitor yet.
                Items in [brackets] still need the owner&apos;s details.
              </span>
            </p>
          ) : null}
          <div className={pages.prose}>{children}</div>
          <p className={pages.updated}>Last updated {updated}</p>
        </div>
      </section>
    </>
  );
}

/** A detail only the owner can supply; shown in brackets so it stands out. */
export const Owner = ({ children }: { children: React.ReactNode }) => <mark style={{ background: "none", color: "var(--warn)" }}>[{children}]</mark>;
