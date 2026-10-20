import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import type { User } from "@kush/contracts";
import type { WebHelpers } from "./accounts.js";
import { EntitlementService } from "./entitlement-service.js";
import { demand } from "./staff-access.js";
import { SupportError } from "./support-service.js";
import type { StaffHelpers } from "./web-staff.js";

/**
 * Read-mostly views built from existing records:
 * - customers: notification feed (derived from the outbox), summary counts,
 *   their own products;
 * - staff: customers, operations (bot + outbox health), catalogue & orders,
 *   settings. Nothing here invents data.
 */

const tenantOf = () =>
  process.env.KUSH_SUPPORT_TENANT_ID ??
  (() => {
    throw new SupportError(503, "Not configured");
  })();

interface FeedRow {
  id: string;
  kind: string;
  subject_id: string;
  detail: Record<string, string>;
  created_at: Date;
  ref: number | null;
  title: string | null;
}

const ticketStatus: Record<string, string> = {
  waiting_for_customer: "is waiting for your reply",
  resolved: "was resolved",
  closed: "was closed",
};
const commissionStatus: Record<string, string> = {
  reviewing: "is under review",
  awaiting_customer: "is waiting for you",
  quoted: "has a quote ready",
  accepted: "was accepted",
  in_progress: "is in progress",
  awaiting_review: "is ready for your review",
  completed: "was delivered",
  cancelled: "was cancelled",
};
const applicationStatus: Record<string, string> = {
  reviewing: "is being reviewed",
  more_info: "needs more information",
  interview: "moved to interview",
  conditionally_accepted: "was conditionally accepted",
  nda_signed: "NDA was signed",
  approved: "was approved",
  activated: "is complete. Welcome to the team",
  rejected: "was not successful",
  withdrawn: "was withdrawn",
};

function feedItem(row: FeedRow) {
  const s = row.detail.status ?? "";
  const base = { id: row.id, createdAt: row.created_at };
  switch (row.kind) {
    case "ticket.message":
      return {
        ...base,
        text: `The KUSH team replied to ticket #${row.ref}`,
        href: `/account/support/${row.subject_id}`,
      };
    case "ticket.status":
      return ticketStatus[s]
        ? {
            ...base,
            text: `Ticket #${row.ref} ${ticketStatus[s]}`,
            href: `/account/support/${row.subject_id}`,
          }
        : null;
    case "commission.status":
      return commissionStatus[s]
        ? {
            ...base,
            text: `Commission “${row.title}” ${commissionStatus[s]}`,
            href: `/account/commissions/${row.subject_id}`,
          }
        : null;
    case "commission.milestone":
      return {
        ...base,
        text: `A milestone was completed on “${row.title}”`,
        href: `/account/commissions/${row.subject_id}`,
      };
    case "agreement.issued":
      return {
        ...base,
        text: "Your staff NDA is ready to sign",
        href: `/account/agreements/${row.detail.agreementId}`,
      };
    case "application.status":
      return applicationStatus[s]
        ? {
            ...base,
            text: `Staff application #${row.ref} ${applicationStatus[s]}`,
            href: `/account/applications/${row.subject_id}`,
          }
        : null;
    default:
      return null;
  }
}

export async function registerInsights(
  app: FastifyInstance,
  { pool, web, staff }: { pool: Pool; web: WebHelpers; staff: StaffHelpers },
) {
  const { signedIn } = web;
  const { asStaff } = staff;
  const entitlements = new EntitlementService(pool);
  const asUser = (userId: string) =>
    ({
      id: userId,
      email: "customer@accounts.kush.invalid",
      role: "customer",
    }) as User;

  // ------------------------------------------------------------- customers

  /** Customer-facing outbox entries about the signed-in user's records. */
  const feed = async (userId: string) => {
    const rows = await pool.query<FeedRow>(
      `SELECT j.id,j.kind,j.subject_id,j.detail,j.created_at,
              COALESCE(t.number,a.number) AS ref, r.title
       FROM notification_jobs j
       LEFT JOIN support_tickets t ON t.tenant_id=j.tenant_id AND t.id=j.subject_id AND j.kind LIKE 'ticket.%'
       LEFT JOIN commercial_requests r ON r.tenant_id=j.tenant_id AND r.id=j.subject_id AND j.kind LIKE 'commission.%'
       LEFT JOIN staff_applications a ON a.tenant_id=j.tenant_id AND a.id=j.subject_id AND (j.kind LIKE 'application.%' OR j.kind='agreement.issued')
       WHERE j.tenant_id=$1 AND (
         (j.kind='ticket.message' AND j.detail->>'audience'='customer' AND t.customer_id=$2) OR
         (j.kind='ticket.status' AND t.customer_id=$2) OR
         ((j.kind='commission.status' OR j.kind='commission.milestone') AND r.requester_id=$2) OR
         ((j.kind='application.status' OR j.kind='agreement.issued') AND a.user_id=$2))
       ORDER BY j.created_at DESC LIMIT 60`,
      [tenantOf(), userId],
    );
    return rows.rows.map(feedItem).filter((item) => item !== null);
  };

  app.get(
    "/web/account/notifications",
    signedIn(async (session) => {
      const [items, seen] = await Promise.all([
        feed(session.userId),
        pool.query<{ seen: Date | null }>(
          "SELECT notifications_seen_at AS seen FROM users WHERE id=$1",
          [session.userId],
        ),
      ]);
      const seenAt = seen.rows[0]?.seen ?? null;
      return {
        notifications: items.map((item) => ({
          ...item,
          unread: !seenAt || item.createdAt > seenAt,
        })),
        unread: items.filter((item) => !seenAt || item.createdAt > seenAt)
          .length,
      };
    }),
  );

  app.post(
    "/web/account/notifications/seen",
    signedIn(async (session) => {
      await pool.query(
        "UPDATE users SET notifications_seen_at=now() WHERE id=$1",
        [session.userId],
      );
      return { seen: true };
    }),
  );

  app.get(
    "/web/account/summary",
    signedIn(async (session) => {
      const tenant = tenantOf();
      const counts = (
        await pool.query<{
          tickets: number;
          waiting: number;
          commissions: number;
          applications: number;
          products: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM support_tickets WHERE tenant_id=$1 AND customer_id=$2 AND status<>'closed') AS tickets,
             (SELECT count(*)::int FROM support_tickets WHERE tenant_id=$1 AND customer_id=$2 AND status='waiting_for_customer') AS waiting,
             (SELECT count(*)::int FROM commercial_requests WHERE tenant_id=$1 AND requester_id=$2 AND kind='commission' AND status NOT IN ('completed','cancelled')) AS commissions,
             (SELECT count(*)::int FROM staff_applications WHERE tenant_id=$1 AND user_id=$2 AND status NOT IN ('activated','rejected','withdrawn')) AS applications,
             (SELECT count(*)::int FROM entitlements WHERE tenant_id=$1 AND user_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now())) AS products`,
          [tenant, session.userId],
        )
      ).rows[0]!;
      return counts;
    }),
  );

  app.get(
    "/web/account/products",
    signedIn(async (session) => ({
      entitlements: await entitlements
        .listOwnEntitlements(asUser(session.userId), tenantOf())
        .catch((error: unknown) => {
          // Accounts without a support membership simply own nothing.
          if (error instanceof SupportError && error.status === 404) return [];
          throw error;
        }),
    })),
  );

  // ------------------------------------------------------------------ staff

  app.get(
    "/web/staff/customers",
    asStaff(async (ctx) => {
      demand(ctx, "customers.view");
      const rows = await pool.query(
        `SELECT u.id, COALESCE(u.display_name,i.username,'Customer') AS name, i.subject AS "discordId",
                u.created_at AS "createdAt", u.disabled,
                (SELECT count(*)::int FROM support_tickets t WHERE t.tenant_id=$1 AND t.customer_id=u.id) AS tickets,
                (SELECT count(*)::int FROM commercial_requests r WHERE r.tenant_id=$1 AND r.requester_id=u.id AND r.kind='commission') AS commissions,
                (SELECT count(*)::int FROM entitlements e WHERE e.tenant_id=$1 AND e.user_id=u.id AND e.status='active') AS products,
                (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id AND s.kind='web') AS "lastSeenAt"
         FROM support_members m JOIN users u ON u.id=m.user_id
         LEFT JOIN user_identities i ON i.user_id=u.id AND i.provider='discord'
         WHERE m.tenant_id=$1 AND m.role='customer' AND u.email NOT LIKE '%@test.invalid' AND coalesce(u.display_name,'') NOT LIKE 'TEST %'
         ORDER BY u.created_at DESC LIMIT 300`,
        [ctx.tenantId],
      );
      return { customers: rows.rows };
    }),
  );

  app.get(
    "/web/staff/operations",
    asStaff(async (ctx) => {
      demand(ctx, "operations.view");
      const healthUrl =
        process.env.KUSH_BOT_HEALTH_URL ?? "http://127.0.0.1:4321/health";
      const [bot, outbox, failed, roleSync] = await Promise.all([
        fetch(healthUrl, { signal: AbortSignal.timeout(3_000) })
          .then((r) => r.json())
          .catch(() => null),
        pool.query(
          `SELECT kind,status,count(*)::int AS count FROM notification_jobs WHERE tenant_id=$1
           AND (status<>'done' OR created_at > now() - interval '7 days') GROUP BY kind,status ORDER BY kind,status`,
          [ctx.tenantId],
        ),
        pool.query(
          `SELECT id,kind,attempts,last_error AS "lastError",created_at AS "createdAt",next_attempt_at AS "nextAttemptAt",status
           FROM notification_jobs WHERE tenant_id=$1 AND (status='failed' OR (status='pending' AND attempts>0))
           ORDER BY created_at DESC LIMIT 50`,
          [ctx.tenantId],
        ),
        pool.query(
          "SELECT status,count(*)::int AS count FROM role_sync_jobs WHERE tenant_id=$1 GROUP BY status",
          [ctx.tenantId],
        ),
      ]);
      return {
        bot,
        outbox: outbox.rows,
        problems: failed.rows,
        roleSync: roleSync.rows,
      };
    }),
  );

  app.post(
    "/web/staff/operations/jobs/:jobId/retry",
    {
      schema: {
        params: {
          type: "object",
          properties: { jobId: { type: "string", format: "uuid" } },
          required: ["jobId"],
          additionalProperties: false,
        },
      },
    },
    asStaff(async (ctx, request: FastifyRequest) => {
      demand(ctx, "operations.view");
      const { jobId } = request.params as { jobId: string };
      const result = await pool.query(
        `UPDATE notification_jobs SET status='pending',attempts=0,next_attempt_at=now(),leased_until=NULL
         WHERE tenant_id=$1 AND id=$2 AND status IN ('failed','pending')`,
        [ctx.tenantId, jobId],
      );
      if (!result.rowCount) throw new SupportError(404, "Job not found");
      await pool.query(
        "INSERT INTO audit_events(actor_id,action,tenant_id) VALUES($1,'staff.notification.retried',$2)",
        [ctx.userId, ctx.tenantId],
      );
      return { retried: true };
    }),
  );

  app.get(
    "/web/staff/catalog",
    asStaff(async (ctx) => {
      demand(ctx, "operations.view");
      const [products, orders] = await Promise.all([
        pool.query(
          `SELECT p.id,p.slug,p.name,p.status,p.discord_role_id AS "discordRoleId",p.created_at AS "createdAt",
                  (SELECT count(*)::int FROM entitlements e WHERE e.tenant_id=p.tenant_id AND e.product_id=p.id AND e.status='active') AS "activeOwners"
           FROM products p WHERE p.tenant_id=$1 ORDER BY p.created_at DESC`,
          [ctx.tenantId],
        ),
        pool.query(
          `SELECT id,provider,type,result,received_at AS "receivedAt",payload->>'orderId' AS "orderId",payload->>'productSlug' AS "productSlug"
           FROM purchase_events WHERE tenant_id=$1 ORDER BY received_at DESC LIMIT 100`,
          [ctx.tenantId],
        ),
      ]);
      return {
        products: products.rows,
        orders: orders.rows,
        paymentsLive: false,
      };
    }),
  );

  app.get(
    "/web/staff/settings",
    asStaff(async (ctx) => {
      demand(ctx, "operations.view");
      const [mappings, positions, template] = await Promise.all([
        pool.query(
          `SELECT discord_role_id AS "discordRoleId",staff_role AS "staffRole" FROM staff_role_mappings
           WHERE tenant_id=$1 ORDER BY staff_role`,
          [ctx.tenantId],
        ),
        pool.query(
          `SELECT key,title,staff_role AS "staffRole",discord_role_id AS "discordRoleId",open FROM staff_positions
           WHERE tenant_id=$1 ORDER BY title`,
          [ctx.tenantId],
        ),
        pool.query(
          "SELECT version,status FROM agreement_templates WHERE key='staff-nda' ORDER BY created_at DESC LIMIT 1",
        ),
      ]);
      return {
        roleMappings: mappings.rows,
        positions: positions.rows,
        nda: template.rows[0] ?? null,
        security: {
          staffMfaHours: 12,
          webSessionDays: 30,
          webIdleDays: 7,
          paymentsLive: false,
        },
      };
    }),
  );
}
