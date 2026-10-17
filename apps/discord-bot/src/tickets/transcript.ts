import type { TicketDetail } from "../api-client.js";
import { ticketCategory } from "./categories.js";

/**
 * Plain-text transcript. The backend already filters by audience: customers
 * never receive internal notes or staff-only events, so this formats exactly
 * what the caller is entitled to see.
 */
export function formatTranscript(
  detail: TicketDetail & { exportedAt: string },
  participantLabel: (authorId: string) => string = (id) =>
    id === detail.ticket.customerId ? "Customer" : "KUSH staff",
): string {
  const { ticket } = detail;
  const lines = [
    `KUSH ticket #${ticket.number}`,
    `Category: ${ticketCategory(ticket.category)?.label ?? ticket.category}`,
    `Status: ${ticket.status} | Priority: ${ticket.priority}`,
    `Opened: ${ticket.createdAt}`,
    ...(ticket.closureReason
      ? [`Closure reason: ${ticket.closureReason}`]
      : []),
    `Exported: ${detail.exportedAt}`,
    "",
    "Original request:",
    ticket.description,
    "",
    "Messages:",
    ...(detail.messages.length
      ? detail.messages.map(
          (message) =>
            `[${message.createdAt}] ${participantLabel(message.authorId)}${message.kind === "note" ? " (INTERNAL NOTE)" : ""}: ${message.content}`,
        )
      : ["(none)"]),
  ];
  return `${lines.join("\n")}\n`;
}
