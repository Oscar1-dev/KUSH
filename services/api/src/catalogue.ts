import type { FastifyInstance } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import { catalogueSeed } from "./catalogue-seed.js";
import { priceLabel } from "./money.js";
import { SupportError } from "./support-service.js";

/**
 * The service catalogue: services (with page content) and their priced
 * offers (tiers and add-ons). The website, the Discord bot and quotes all
 * read prices from here; nothing hard-codes them.
 */

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const catalogueBodySchema = z
  .object({
    headline: z.tuple([text(1, 40), text(1, 40)]).optional(),
    intro: text(1, 1_200).optional(),
    offerings: z
      .array(z.object({ title: text(1, 80), text: text(1, 300) }))
      .max(12)
      .optional(),
    deliverables: z.array(text(1, 160)).max(12).optional(),
    goodFit: z.array(text(1, 160)).max(12).optional(),
    availability: z
      .object({
        now: z.array(text(1, 160)).max(12),
        partner: z.array(text(1, 200)).max(12),
      })
      .optional(),
    faqs: z
      .array(z.object({ q: text(1, 200), a: text(1, 1_000) }))
      .max(12)
      .optional(),
  })
  .strict();
export type CatalogueBody = z.infer<typeof catalogueBodySchema>;

export const categories = [
  "websites",
  "web-apps",
  "discord",
  "software",
  "gaming",
  "technical",
  "creative",
  "automation",
] as const;

const serviceInput = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
    category: z.enum(categories),
    name: text(2, 120),
    summary: text(2, 300),
    body: catalogueBodySchema.default({}),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    fulfilment: z
      .enum(["in_house", "partner_dependent", "quote_only"])
      .default("in_house"),
    position: z.number().int().min(0).max(999).default(0),
  })
  .strict();
const servicePatch = serviceInput
  .partial()
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();

const offerShape = {
  kind: z.enum(["tier", "addon"]).default("tier"),
  tierKey: z.enum(["starter", "standard", "premium"]).nullable().default(null),
  name: text(2, 120),
  description: z.string().trim().max(600).default(""),
  pricing: z.enum(["fixed", "from", "range", "quote"]),
  amountPence: z.number().int().min(0).max(100_000_00).nullable().default(null),
  maxPence: z.number().int().min(0).max(100_000_00).nullable().default(null),
  deliveryEstimate: z.string().trim().max(80).nullable().default(null),
  includes: z.array(text(1, 160)).max(12).default([]),
  status: z.enum(["published", "archived"]).default("published"),
  position: z.number().int().min(0).max(999).default(0),
};
/** Price rules: quote has no amount; fixed/from need one; range needs both. */
const priceRule = (offer: {
  pricing: string;
  amountPence: number | null;
  maxPence: number | null;
}) =>
  offer.pricing === "quote"
    ? offer.amountPence === null && offer.maxPence === null
    : offer.pricing === "range"
      ? offer.amountPence !== null &&
        offer.maxPence !== null &&
        offer.maxPence > offer.amountPence
      : offer.amountPence !== null && offer.maxPence === null;
const offerInput = z
  .object(offerShape)
  .strict()
  .refine(priceRule, "Price doesn't match the pricing type");
const offerPatch = z.object(offerShape).partial().strict();

export interface Offer {
  id: string;
  kind: "tier" | "addon";
  tierKey: "starter" | "standard" | "premium" | null;
  name: string;
  description: string;
  pricing: "fixed" | "from" | "range" | "quote";
  amountPence: number | null;
  maxPence: number | null;
  currency: string;
  priceLabel: string;
  deliveryEstimate: string | null;
  includes: string[];
  status: "published" | "archived";
  position: number;
}
export interface CatalogueService {
  id: string;
  slug: string;
  category: (typeof categories)[number];
  name: string;
  summary: string;
  body: CatalogueBody;
  status: "draft" | "published" | "archived";
  fulfilment: "in_house" | "partner_dependent" | "quote_only";
  position: number;
  version: number;
  startingPrice: string | null;
  offers: Offer[];
}

const serviceColumns = `id, slug, category, name, summary, body, status, fulfilment, position, version`;
const offerColumns = `id, service_id AS "serviceId", kind, tier_key AS "tierKey", name, description, pricing,
  amount_pence AS "amountPence", max_pence AS "maxPence", currency, delivery_estimate AS "deliveryEstimate",
  includes, status, position`;

export class CatalogueService_ {
  constructor(private readonly pool: Pool) {}

  async list(
    tenantId: string,
    scope: "public" | "staff",
  ): Promise<CatalogueService[]> {
    const services = await this.pool.query<
      Omit<CatalogueService, "offers" | "startingPrice">
    >(
      `SELECT ${serviceColumns} FROM catalogue_services WHERE tenant_id=$1 ${scope === "public" ? "AND status='published'" : ""}
       ORDER BY position, name`,
      [tenantId],
    );
    const offers = await this.pool.query<
      Omit<Offer, "priceLabel"> & { serviceId: string }
    >(
      `SELECT ${offerColumns} FROM catalogue_offers WHERE tenant_id=$1 ${scope === "public" ? "AND status='published'" : ""}
       ORDER BY kind DESC, position, name`,
      [tenantId],
    );
    return services.rows.map((service) => {
      const own = offers.rows
        .filter((offer) => offer.serviceId === service.id)
        .map((row) => {
          const offer: Omit<typeof row, "serviceId"> & { serviceId?: string } =
            { ...row };
          delete offer.serviceId;
          return { ...offer, priceLabel: priceLabel(offer) };
        });
      const priced = own.filter(
        (offer) => offer.kind === "tier" && offer.amountPence !== null,
      );
      const cheapest = priced.sort(
        (a, b) => a.amountPence! - b.amountPence!,
      )[0];
      return {
        ...service,
        offers: own,
        startingPrice: cheapest
          ? priceLabel({
              ...cheapest,
              pricing: cheapest.pricing === "range" ? "from" : cheapest.pricing,
              maxPence: null,
            })
          : null,
      };
    });
  }

  async get(tenantId: string, slug: string, scope: "public" | "staff") {
    const service = (await this.list(tenantId, scope)).find(
      (item) => item.slug === slug,
    );
    if (!service) throw new SupportError(404, "Service not found");
    return service;
  }

  async createService(tenantId: string, raw: unknown) {
    const input = serviceInput.parse(raw);
    const row = await this.pool
      .query<{ id: string }>(
        `INSERT INTO catalogue_services(tenant_id, slug, category, name, summary, body, status, fulfilment, position)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          tenantId,
          input.slug,
          input.category,
          input.name,
          input.summary,
          JSON.stringify(input.body),
          input.status,
          input.fulfilment,
          input.position,
        ],
      )
      .catch((error: { code?: string }) => {
        if (error.code === "23505")
          throw new SupportError(
            409,
            "A service with that slug already exists",
          );
        throw error;
      });
    return row.rows[0]!.id;
  }

  async updateService(tenantId: string, id: string, raw: unknown) {
    const { expectedVersion, ...patch } = servicePatch.parse(raw);
    const sets: string[] = [];
    const values: unknown[] = [tenantId, id, expectedVersion];
    const column: Record<string, string> = {
      slug: "slug",
      category: "category",
      name: "name",
      summary: "summary",
      body: "body",
      status: "status",
      fulfilment: "fulfilment",
      position: "position",
    };
    for (const [key, value] of Object.entries(patch)) {
      values.push(key === "body" ? JSON.stringify(value) : value);
      sets.push(`${column[key]}=$${values.length}`);
    }
    if (!sets.length) throw new SupportError(400, "No changes supplied");
    const result = await this.pool.query(
      `UPDATE catalogue_services SET ${sets.join(",")}, version=version+1, updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND version=$3`,
      values,
    );
    if (!result.rowCount)
      throw new SupportError(
        409,
        "This service changed since you loaded it. Refresh and try again",
      );
  }

  async createOffer(tenantId: string, serviceId: string, raw: unknown) {
    const input = offerInput.parse(raw);
    const service = await this.pool.query(
      "SELECT 1 FROM catalogue_services WHERE tenant_id=$1 AND id=$2",
      [tenantId, serviceId],
    );
    if (!service.rowCount) throw new SupportError(404, "Service not found");
    const row = await this.pool.query<{ id: string }>(
      `INSERT INTO catalogue_offers(tenant_id, service_id, kind, tier_key, name, description, pricing, amount_pence, max_pence, delivery_estimate, includes, status, position)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        tenantId,
        serviceId,
        input.kind,
        input.tierKey,
        input.name,
        input.description,
        input.pricing,
        input.amountPence,
        input.maxPence,
        input.deliveryEstimate,
        input.includes,
        input.status,
        input.position,
      ],
    );
    return row.rows[0]!.id;
  }

  async updateOffer(tenantId: string, offerId: string, raw: unknown) {
    const patch = offerPatch.parse(raw);
    const current = (
      await this.pool.query<{
        pricing: string;
        amountPence: number | null;
        maxPence: number | null;
      }>(
        `SELECT pricing, amount_pence AS "amountPence", max_pence AS "maxPence" FROM catalogue_offers WHERE tenant_id=$1 AND id=$2`,
        [tenantId, offerId],
      )
    ).rows[0];
    if (!current) throw new SupportError(404, "Offer not found");
    if (!priceRule({ ...current, ...patch }))
      throw new SupportError(400, "Price doesn't match the pricing type");
    const column: Record<string, string> = {
      kind: "kind",
      tierKey: "tier_key",
      name: "name",
      description: "description",
      pricing: "pricing",
      amountPence: "amount_pence",
      maxPence: "max_pence",
      deliveryEstimate: "delivery_estimate",
      includes: "includes",
      status: "status",
      position: "position",
    };
    const sets: string[] = [];
    const values: unknown[] = [tenantId, offerId];
    for (const [key, value] of Object.entries(patch)) {
      values.push(value);
      sets.push(`${column[key]}=$${values.length}`);
    }
    if (!sets.length) throw new SupportError(400, "No changes supplied");
    await this.pool.query(
      `UPDATE catalogue_offers SET ${sets.join(",")}, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
      values,
    );
  }

  /** Inserts the starting catalogue once, for a tenant that has none. */
  async seedIfEmpty(tenantId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // Serialise concurrent first boots on the tenant row.
      await c.query("SELECT 1 FROM support_tenants WHERE id=$1 FOR UPDATE", [
        tenantId,
      ]);
      const existing = await c.query(
        "SELECT 1 FROM catalogue_services WHERE tenant_id=$1 LIMIT 1",
        [tenantId],
      );
      if (existing.rowCount) {
        await c.query("ROLLBACK");
        return false;
      }
      for (const [index, service] of catalogueSeed.entries()) {
        const id = (
          await c.query<{ id: string }>(
            `INSERT INTO catalogue_services(tenant_id, slug, category, name, summary, body, status, fulfilment, position)
             VALUES($1,$2,$3,$4,$5,$6,'published',$7,$8) RETURNING id`,
            [
              tenantId,
              service.slug,
              service.category,
              service.name,
              service.summary,
              JSON.stringify(service.body),
              service.fulfilment ?? "in_house",
              index,
            ],
          )
        ).rows[0]!.id;
        for (const [position, offer] of service.offers.entries())
          await c.query(
            `INSERT INTO catalogue_offers(tenant_id, service_id, kind, tier_key, name, description, pricing, amount_pence, max_pence, includes, position)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              tenantId,
              id,
              offer.kind ?? "tier",
              offer.tier ?? null,
              offer.name,
              offer.description ?? "",
              offer.pricing,
              offer.amount ?? null,
              offer.max ?? null,
              offer.includes ?? [],
              position,
            ],
          );
      }
      await c.query("COMMIT");
      return true;
    } catch (error) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
  }
}
export { CatalogueService_ as Catalogue };

/** Public read routes. Staff routes live with the staff API (permissions). */
export async function registerCatalogue(
  app: FastifyInstance,
  { pool }: { pool: Pool },
) {
  const catalogue = new CatalogueService_(pool);
  const tenantId = () => process.env.KUSH_SUPPORT_TENANT_ID;
  const configured = tenantId();
  if (configured)
    await catalogue
      .seedIfEmpty(configured)
      .catch((error: unknown) =>
        app.log.error({ error }, "catalogue.seed.failed"),
      );

  app.get("/public/catalogue", async (_request, reply) => {
    const id = tenantId();
    if (!id) return { services: [] };
    reply.header("Cache-Control", "public, max-age=30");
    return { services: await catalogue.list(id, "public") };
  });
  app.get<{ Params: { slug: string } }>(
    "/public/catalogue/:slug",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,59}$" },
          },
          required: ["slug"],
        },
      },
    },
    async (request, reply) => {
      const id = tenantId();
      if (!id) return reply.code(404).send({ error: "Service not found" });
      try {
        reply.header("Cache-Control", "public, max-age=30");
        return {
          service: await catalogue.get(id, request.params.slug, "public"),
        };
      } catch (error) {
        if (error instanceof SupportError)
          return reply.code(error.status).send({ error: error.message });
        throw error;
      }
    },
  );
}
