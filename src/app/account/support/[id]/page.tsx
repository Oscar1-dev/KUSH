import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplyForm } from "@/components/account/workspace-forms";
import styles from "@/components/account/account.module.css";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime, needsYou, ticketLabel, type Ticket, type TicketMessage } from "@/lib/workspace";

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await requireAccount();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let data: { ticket: Ticket; messages: TicketMessage[] };
  let categories: { key: string; label: string }[];
  try {
    [data, { categories }] = await Promise.all([
      kushApi<{ ticket: Ticket; messages: TicketMessage[] }>(`/web/workspace/tickets/${id}`, { token }),
      kushApi<{ categories: { key: string; label: string }[] }>("/web/workspace/ticket-categories", { token }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { ticket, messages } = data;
  const category = categories.find((c) => c.key === ticket.category)?.label ?? ticket.category;
  const closed = ticket.status === "closed";

  return (
    <>
      <Link href="/account/support" className={styles.rowMeta}>
        ← Support tickets
      </Link>
      {isNew ? (
        <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status" style={{ marginTop: 20 }}>
          Ticket opened. A KUSH team member will reply here.
        </p>
      ) : null}
      <div className={styles.headerRow} style={{ marginTop: 22 }}>
        <div>
          <p className={styles.kicker}>TICKET #{ticket.number}</p>
          <h1 className={styles.title} style={{ fontSize: "clamp(36px, 5vw, 64px)" }}>
            {category}
          </h1>
        </div>
        <span
          className={`${styles.badge} ${needsYou(ticket.status) ? styles.badgeWarn : ticket.status === "resolved" ? styles.badgeOn : ""}`}
          style={{ marginBottom: 18 }}
        >
          {ticketLabel[ticket.status].toUpperCase()}
        </span>
      </div>
      <p className={styles.rowMeta} style={{ marginBottom: 28 }}>
        Opened {dateTime.format(new Date(ticket.createdAt))}
        {ticket.assigned ? " · a KUSH team member is handling this" : " · waiting for a team member"}
      </p>

      <div className={styles.thread} aria-label="Conversation">
        <div className={`${styles.bubble} ${styles.bubbleMine}`}>
          {ticket.description}
          <span className={styles.bubbleMeta}>YOU · {dateTime.format(new Date(ticket.createdAt)).toUpperCase()}</span>
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`${styles.bubble} ${m.fromYou ? styles.bubbleMine : ""}`}>
            {m.content}
            <span className={styles.bubbleMeta}>
              {m.fromYou ? "YOU" : "KUSH TEAM"} · {dateTime.format(new Date(m.createdAt)).toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {closed ? (
        <div className={styles.notice}>
          This ticket is closed{ticket.closureReason ? `: ${ticket.closureReason}` : "."} Open a new ticket if you
          still need help.
        </div>
      ) : (
        // Remount after each reply so the next one gets a fresh request ID and version.
        <ReplyForm key={ticket.version} ticketId={ticket.id} version={ticket.version} requestId={randomUUID()} />
      )}
    </>
  );
}
