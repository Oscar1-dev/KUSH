import { z } from "zod";
export * from "./support.js";
export * from "./commercial.js";
export const loginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();
export const loginJsonSchema = z.toJSONSchema(loginSchema, {
  target: "draft-7",
});
export const roles = ["admin", "operator", "viewer", "customer"] as const;
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(roles),
});
export const responseSchemas = {
  "/health": z.toJSONSchema(
    z.object({ status: z.literal("ok"), database: z.literal("connected") }),
  ),
  "/auth/login": z.toJSONSchema(
    z.object({ token: z.string(), user: userSchema }),
  ),
  "/auth/me": z.toJSONSchema(z.object({ user: userSchema })),
  "/audit": z.toJSONSchema(
    z.object({
      events: z.array(
        z.object({
          id: z.uuid(),
          actorId: z.uuid().nullable(),
          action: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
  ),
};
export type Role = (typeof roles)[number];
export interface User {
  id: string;
  email: string;
  role: Role;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  user: User;
}
export interface HealthResponse {
  status: "ok" | "unavailable";
  database: "connected" | "unavailable";
}
export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  createdAt: string;
}

// Service delivery contracts. Approval is an operator-recorded acknowledgement, not e-signature.
export const clientInputSchema = z
  .object({
    organisation: z.string().trim().min(1).max(160),
    contactEmail: z.email().max(254),
    notes: z.string().max(4000),
  })
  .strict();
export const clientUpdateSchema = clientInputSchema.extend({
  expectedVersion: z.number().int().positive(),
  archived: z.boolean(),
});
export const projectStatuses = [
  "draft",
  "active",
  "ready_for_handover",
  "delivered",
  "archived",
] as const;
export const checklistSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(300),
    completed: z.boolean(),
    evidence: z.string().max(2000),
  })
  .strict();
export const taskSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(2000),
    dueDate: z.iso.date().nullable(),
    completed: z.boolean(),
  })
  .strict();
export const proposalSchema = z
  .object({
    pricePence: z.number().int().min(0).max(100000000),
    revisionLimit: z.number().int().min(0).max(100),
    terms: z.string().trim().min(1).max(6000),
  })
  .strict();
export const handoverSchema = z
  .object({
    ownership: z.boolean(),
    access: z.boolean(),
    documentation: z.boolean(),
    backup: z.boolean(),
    support: z.boolean(),
    maintenanceScope: z.string().max(2000),
  })
  .strict();
export const projectCreateSchema = z
  .object({
    clientId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    scope: z.string().trim().min(1).max(6000),
  })
  .strict();
export const projectUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    scope: z.string().trim().min(1).max(6000),
    status: z.enum(projectStatuses),
    proposal: proposalSchema.nullable(),
    tasks: z.array(taskSchema).max(100),
    deliverables: z.array(checklistSchema).max(100),
    acceptanceChecks: z.array(checklistSchema).max(100),
    handover: handoverSchema,
    handoverNotes: z.string().max(4000),
  })
  .strict();
export const approvalSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    approvedBy: z.string().trim().min(1).max(200),
    approvalEvidence: z.string().trim().min(1).max(2000),
  })
  .strict();
export interface Client extends z.infer<typeof clientInputSchema> {
  id: string;
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Project extends Omit<
  z.infer<typeof projectUpdateSchema>,
  "expectedVersion"
> {
  id: string;
  clientId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  approval: {
    approvedBy: string;
    approvedAt: string;
    approvalEvidence: string;
    recordedBy: string;
  } | null;
}
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
export type DeliveryChecklistItem = z.infer<typeof checklistSchema>;
export type DeliveryTask = z.infer<typeof taskSchema>;
export { z };
