import { z } from "zod";
export const supportStatuses = [
  "open",
  "pending",
  "in_progress",
  "waiting_for_customer",
  "resolved",
  "closed",
  "reopened",
] as const;
export const supportPriorities = ["low", "normal", "high", "urgent"] as const;
export const supportRoles = ["owner", "staff", "customer"] as const;
export type SupportRole = (typeof supportRoles)[number];
export const supportConfigSchema = z
  .object({
    categories: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
            label: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .refine(
        (v) => new Set(v.map((c) => c.key)).size === v.length,
        "Duplicate category",
      ),
    retentionDays: z.number().int().min(1).max(3650).nullable(),
    allowReopen: z.boolean(),
  })
  .strict();
export const tenantInputSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    clientId: z.uuid().nullable().default(null),
    projectId: z.uuid().nullable().default(null),
    guildId: z
      .string()
      .regex(/^[0-9]{17,20}$/)
      .nullable()
      .default(null),
    config: supportConfigSchema,
  })
  .strict();
export const memberInputSchema = z
  .object({ userId: z.uuid(), role: z.enum(supportRoles) })
  .strict();
export const ticketInputSchema = z
  .object({
    requestId: z.uuid(),
    category: z.string().min(1).max(40),
    description: z.string().trim().min(1).max(10000),
  })
  .strict();
export const ticketPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.enum(supportStatuses).optional(),
    priority: z.enum(supportPriorities).optional(),
    category: z.string().min(1).max(40).optional(),
    assignedUserId: z.uuid().nullable().optional(),
  })
  .strict();
export const messageInputSchema = z
  .object({
    requestId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    kind: z.enum(["reply", "note"]),
    content: z.string().trim().min(1).max(10000),
  })
  .strict();
export const closeTicketSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirm: z.literal(true),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const reopenTicketSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export interface SupportTenant {
  id: string;
  name: string;
  clientId: string | null;
  projectId: string | null;
  guildId: string | null;
  guildStatus: "unverified";
  config: z.infer<typeof supportConfigSchema>;
  currentUserRole: SupportRole;
  createdAt: string;
  updatedAt: string;
}
export interface SupportMember {
  userId: string;
  email: string;
  role: SupportRole;
  disabled: boolean;
  appRole: "admin" | "operator" | "viewer" | "customer";
}
export interface SupportTicket {
  id: string;
  tenantId: string;
  number: number;
  customerId: string;
  category: string;
  status: (typeof supportStatuses)[number];
  priority: (typeof supportPriorities)[number];
  assignedUserId: string | null;
  version: number;
  description: string;
  closureReason: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}
export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string;
  kind: "reply" | "note";
  content: string;
  createdAt: string;
}
export interface SupportEvent {
  id: string;
  ticketId: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface SupportTicketDetail {
  ticket: SupportTicket;
  messages: SupportMessage[];
  events: SupportEvent[];
}
export interface SupportTranscript extends SupportTicketDetail {
  exportedAt: string;
}
