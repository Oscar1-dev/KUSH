import { z } from "zod";

export const commercialKinds = [
  "commission",
  "marketplace",
  "partner",
] as const;
export const commercialStatuses = [
  "submitted",
  "reviewing",
  "awaiting_customer",
  "quoted",
  "accepted",
  "payment_pending",
  "paid",
  "in_progress",
  "awaiting_review",
  "revision_requested",
  "approved",
  "published",
  "completed",
  "rejected",
  "cancelled",
  "refunded",
] as const;

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
export const commercialRequestInputSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(commercialKinds),
    title: text(200),
    details: text(10_000),
    category: text(80),
    approximateBudget: z.string().trim().max(120).nullable().default(null),
    preferredTimeframe: z.string().trim().max(200).nullable().default(null),
    productUrl: z.url().max(2_000).nullable().default(null),
    serviceTier: z
      .enum(["starter", "standard", "premium"])
      .nullable()
      .default(null),
    referenceLinks: z.string().trim().max(2_000).nullable().default(null),
    contactPreference: z.string().trim().max(200).nullable().default(null),
    origin: z.enum(["website", "discord"]).default("website"),
  })
  .strict();

export const commercialRequestPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.enum(commercialStatuses).optional(),
    assignedUserId: z.uuid().nullable().optional(),
    reviewNote: z.string().trim().max(4_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, "No changes supplied");

export const discordLinkStartSchema = z
  .object({ requestId: z.uuid() })
  .strict();
export const discordLinkCompleteSchema = z
  .object({
    code: z.string().regex(/^[A-HJ-NP-Z2-9]{16}$/),
    discordUserId: z.string().regex(/^[0-9]{17,20}$/),
    guildId: z.string().regex(/^[0-9]{17,20}$/),
  })
  .strict();
export const discordActorSchema = z
  .object({
    discordUserId: z.string().regex(/^[0-9]{17,20}$/),
    guildId: z.string().regex(/^[0-9]{17,20}$/),
  })
  .strict();

export interface CommercialRequest {
  id: string;
  tenantId: string;
  requesterId: string;
  kind: (typeof commercialKinds)[number];
  status: (typeof commercialStatuses)[number];
  title: string;
  details: string;
  category: string;
  approximateBudget: string | null;
  preferredTimeframe: string | null;
  productUrl: string | null;
  assignedUserId: string | null;
  reviewNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  serviceTier: "starter" | "standard" | "premium" | null;
  referenceLinks: string | null;
  contactPreference: string | null;
  origin: "website" | "discord";
}
