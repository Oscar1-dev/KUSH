import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { requireStaff } from "@/lib/server/staff";
import { dateOnly, dateTime, ticketLabel, type TicketStatus } from "@/lib/workspace";

interface Detail {
  ticket: {
    id: string;
    number: number;
    category: string;
    status: TicketStatus;
    priority: string;
    description: string;
    version: number;
    closureReason: string | null;
    createdAt: string;
    assignedUserId: string | null;
    customerName: string;
    customerDiscordId: string | null;
    customerSince: string;
  };
  messages: { id: string; kind: "reply" | "note"; content: string; createdAt: string; fromCustomer: boolean; authorName: string }[];
  actions: { reply: boolean; claim: boolean; assign: boolean; statuses: string[] };
}

export default async function StaffTicket({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let detail: Detail;
  try {
    detail = await kushApi<Detail>(`/web/staff/tickets/${id}`, { token: gate.token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { ticket, messages, actions } = detail;
  const team = actions.assign
    ? (await kushApi<{ team: { userId: string; name: string; roles: string[] }[] }>("/web/staff/team", { token: gate.token }))
        .team
    : [];
  const v = { ticketId: ticket.id, expectedVersion: ticket.version };

  return (
    <>
      <Link href="/staff/tickets" className={styles.rowMeta}>
        ← Tickets
      </Link>
      <div className={styles.headerRow} style={{ marginTop: 22 }}>
        <div>
          <p className={styles.kicker}>
            TICKET #{ticket.number} · {ticket.category.toUpperCase()}
          </p>
          <h1 className={styles.title} style={{ fontSize: "clamp(34px, 5vw, 58px)" }}>
            {ticket.customerName}
          </h1>
        </div>
        <span className={styles.badge} style={{ marginBottom: 18 }}>
          {ticketLabel[ticket.status].toUpperCase()}
        </span>
      </div>
      <p className={styles.rowMeta} style={{ marginBottom: 26 }}>
        Opened {dateTime.format(new Date(ticket.createdAt))} · customer since {dateOnly.format(new Date(ticket.customerSince))}
        {ticket.customerDiscordId ? ` · Discord ${ticket.customerDiscordId}` : ""}
      </p>

      <div className={styles.split}>
        <section aria-label="Conversation">
          <div className={styles.thread}>
            <div className={styles.bubble}>
              {ticket.description}
              <span className={styles.bubbleMeta}>CUSTOMER · {dateTime.format(new Date(ticket.createdAt)).toUpperCase()}</span>
            </div>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.bubble} ${m.fromCustomer ? "" : styles.bubbleMine}`}
                style={m.kind === "note" ? { borderStyle: "dashed", borderColor: "rgba(147,99,238,.6)", background: "rgba(147,99,238,.07)" } : undefined}
              >
                {m.content}
                <span className={styles.bubbleMeta}>
                  {m.kind === "note" ? "INTERNAL NOTE · " : ""}
                  {(m.fromCustomer ? "CUSTOMER" : m.authorName).toUpperCase()} · {dateTime.format(new Date(m.createdAt)).toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {actions.reply ? (
            <div className={styles.card} key={`compose-${ticket.version}`}>
              <ActionForm action="message" hidden={{ ...v, requestId: randomUUID() }} submit="SEND">
                <label className={styles.label} htmlFor="content">
                  MESSAGE
                </label>
                <textarea id="content" name="content" className={styles.input} rows={4} required maxLength={10000} />
                <div className={styles.formRow} role="radiogroup" aria-label="Who can see this">
                  <label className={styles.rowMeta}>
                    <input type="radio" name="kind" value="reply" defaultChecked /> Reply to customer
                  </label>
                  <label className={styles.rowMeta}>
                    <input type="radio" name="kind" value="note" /> Internal note (staff only)
                  </label>
                </div>
              </ActionForm>
            </div>
          ) : ticket.status === "closed" ? (
            <p className={styles.notice}>Closed{ticket.closureReason ? `: ${ticket.closureReason}` : "."}</p>
          ) : (
            <p className={styles.notice}>Claim this ticket to reply.</p>
          )}
        </section>

        <aside className={styles.form} style={{ maxWidth: "none" }} aria-label="Ticket actions">
          {actions.claim ? (
            <div className={styles.card} key={`claim-${ticket.version}`}>
              <p className={styles.cardLabel}>UNASSIGNED</p>
              <ActionForm action="claim" hidden={v} submit="CLAIM TICKET" />
            </div>
          ) : null}
          {actions.statuses.length ? (
            <div className={styles.card} key={`status-${ticket.version}`}>
              <p className={styles.cardLabel}>STATUS</p>
              <ActionForm action="status" hidden={v} submit="UPDATE" tone="plain">
                <select name="status" className={styles.input} required defaultValue="" aria-label="New status">
                  <option value="" disabled>
                    Change to…
                  </option>
                  {actions.statuses.map((s) => (
                    <option key={s} value={s}>
                      {ticketLabel[s as TicketStatus] ?? s}
                    </option>
                  ))}
                </select>
                <input name="reason" className={styles.input} maxLength={2000} placeholder="Reason (needed to close)" aria-label="Reason" />
              </ActionForm>
            </div>
          ) : null}
          {actions.assign ? (
            <div className={styles.card} key={`assign-${ticket.version}`}>
              <p className={styles.cardLabel}>ASSIGNED TO</p>
              <ActionForm action="assignTicket" hidden={v} submit="ASSIGN" tone="plain">
                <select name="userId" className={styles.input} defaultValue={ticket.assignedUserId ?? ""} aria-label="Assignee">
                  <option value="">Nobody (back to queue)</option>
                  {team.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.roles.join(", ")})
                    </option>
                  ))}
                </select>
                <p className={styles.rowMeta}>Only people currently holding a support role can be assigned; checked with Discord.</p>
              </ActionForm>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
