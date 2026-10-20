import type { Pool } from "@kush/database";

/**
 * Business overview from real records only, shared by the staff website and
 * Discord. Revenue is cash actually received (Stripe and recorded offline
 * payments, net of refunds); store credit spent is reported separately
 * because it isn't new money.
 */
export async function businessStats(pool: Pool, tenantId: string) {
  const one = async (sql: string) =>
    Number((await pool.query<{ n: string }>(sql, [tenantId])).rows[0]?.n ?? 0);
  return {
    customers: await one(
      // Test accounts (automated tests, TEST-labelled data) aren't customers.
      `SELECT count(*) AS n FROM support_members m JOIN users u ON u.id=m.user_id
       WHERE m.tenant_id=$1 AND m.role='customer' AND u.email NOT LIKE '%@test.invalid'
         AND coalesce(u.display_name,'') NOT LIKE 'TEST %'`,
    ),
    orders: await one(
      "SELECT count(*) AS n FROM orders WHERE tenant_id=$1 AND status IN ('paid','partially_refunded','refunded')",
    ),
    revenuePence: await one(
      "SELECT COALESCE(sum(p.amount_pence - p.refunded_pence),0) AS n FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.tenant_id=$1 AND p.provider<>'store_credit'",
    ),
    creditSpentPence: await one(
      "SELECT COALESCE(sum(p.amount_pence - p.refunded_pence),0) AS n FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.tenant_id=$1 AND p.provider='store_credit'",
    ),
    refundsPence: await one(
      "SELECT COALESCE(sum(refunded_pence),0) AS n FROM orders WHERE tenant_id=$1",
    ),
    openQuotes: await one(
      "SELECT count(*) AS n FROM commission_quotes WHERE tenant_id=$1 AND status='proposed'",
    ),
    activeCommissions: await one(
      "SELECT count(*) AS n FROM commercial_requests WHERE tenant_id=$1 AND kind='commission' AND status IN ('paid','in_progress','awaiting_review','revision_requested')",
    ),
    completedCommissions: await one(
      "SELECT count(*) AS n FROM commercial_requests WHERE tenant_id=$1 AND kind='commission' AND status='completed'",
    ),
    openTickets: await one(
      "SELECT count(*) AS n FROM support_tickets WHERE tenant_id=$1 AND status NOT IN ('resolved','closed')",
    ),
    qualifiedReferrals: await one(
      "SELECT count(*) AS n FROM referrals WHERE tenant_id=$1 AND status='qualified'",
    ),
    flaggedReferrals: await one(
      "SELECT count(*) AS n FROM referrals WHERE tenant_id=$1 AND status='flagged'",
    ),
  };
}
