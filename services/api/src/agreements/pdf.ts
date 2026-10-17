import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/** Standard PDF fonts only cover WinAnsi; replace anything else safely. */
const safe = (text: string) =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");

export interface AgreementRecord {
  id: string;
  status: string;
  title: string;
  version: string;
  body: string;
  body_sha256: string;
  issued_at: Date;
  expires_at: Date;
  signed_at: Date | null;
  legal_name: string | null;
  email: string | null;
  signature: string | null;
  accepted_statement: string | null;
  signed_body_sha256: string | null;
  signer_ip_hash: string | null;
  signer_user_agent: string | null;
}

/**
 * Renders the agreement text, the signature block and an audit trail. The
 * PDF is regenerated from the stored record on every download, so it always
 * matches what the database proves was signed.
 */
export async function agreementPdf(
  record: AgreementRecord,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`${record.title} (${record.version})`));
  pdf.setAuthor("KUSH");
  pdf.setSubject("Signed agreement record");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const margin = 56;
  const width = 595.28 - margin * 2; // A4
  let page = pdf.addPage([595.28, 841.89]);
  let y = 841.89 - margin;

  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 841.89 - margin;
  };
  const write = (
    text: string,
    font: PDFFont = regular,
    size = 10,
    gap = 4,
    color = rgb(0.1, 0.1, 0.12),
  ) => {
    for (const paragraph of safe(text).split("\n")) {
      const words = paragraph.split(/(\s+)/);
      let line = "";
      const flush = () => {
        if (y < margin + size) newPage();
        page.drawText(line, { x: margin, y, size, font, color });
        y -= size + gap;
        line = "";
      };
      if (paragraph.trim() === "") {
        y -= size * 0.6;
        continue;
      }
      for (const word of words) {
        const candidate = line + word;
        if (font.widthOfTextAtSize(candidate, size) > width && line.trim()) {
          flush();
          line = word.trimStart();
        } else line = candidate;
      }
      if (line.trim()) flush();
    }
  };

  write("KUSH", bold, 22, 6, rgb(0.39, 0.6, 0.15));
  write(record.title, bold, 14, 4);
  write(
    `Version ${record.version}  ·  Agreement ${record.id}`.replace("·", "-"),
    regular,
    9,
    14,
    rgb(0.4, 0.4, 0.45),
  );
  write(record.body, regular, 10, 4);

  y -= 12;
  write("SIGNATURE", bold, 12, 8);
  if (record.status === "signed" && record.signed_at) {
    write(`Full legal name: ${record.legal_name}`);
    write(`Email address: ${record.email}`);
    write(`Electronic signature: ${record.signature}`, bold, 12, 6);
    write(`Signed: ${record.signed_at.toISOString()} (UTC)`);
    write(`Acceptance: "${record.accepted_statement}"`, regular, 9, 4);
  } else {
    write(`Status: ${record.status.toUpperCase()} - not signed.`, bold, 11, 6);
  }

  y -= 12;
  write("AUDIT RECORD", bold, 11, 6);
  const audit = [
    `Agreement ID      ${record.id}`,
    `Text version      ${record.version}`,
    `Text SHA-256      ${record.body_sha256}`,
    `Signed SHA-256    ${record.signed_body_sha256 ?? "-"}`,
    `Issued            ${record.issued_at.toISOString()}`,
    `Expiry (unsigned) ${record.expires_at.toISOString()}`,
    `Signer IP (hash)  ${record.signer_ip_hash ?? "-"}`,
    `Signer browser    ${(record.signer_user_agent ?? "-").slice(0, 80)}`,
  ];
  for (const line of audit) write(line, mono, 8, 3);
  y -= 8;
  write(
    "This document is regenerated from KUSH's signed record. The SHA-256 values identify the exact agreement text. This agreement is a draft pending professional legal review.",
    regular,
    8,
    3,
    rgb(0.4, 0.4, 0.45),
  );
  return pdf.save();
}
