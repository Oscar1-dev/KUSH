import type { PoolClient } from "@kush/database";
import { SupportError } from "./support-service.js";

/**
 * KUSH store credit: a GBP ledger. Every movement is a row in
 * credit_transactions with a unique idempotency key, and the balance row is
 * locked while it changes, so retries can't double-apply and two purchases
 * can't spend the same credit. The balance can never go negative (database
 * CHECK), and credit is never paid out as cash.
 */

type Tx = Pick<PoolClient, "query">;
export type CreditKind =
  "reward" | "purchase" | "purchase_release" | "refund" | "adjustment";

export interface CreditMovement {
  tenantId: string;
  userId: string;
  /** Positive adds credit, negative spends it. Never zero. */
  amountPence: number;
  kind: CreditKind;
  idempotencyKey: string;
  reference?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

/** Applies one movement inside the caller's transaction. Idempotent. */
export async function applyCredit(c: Tx, movement: CreditMovement) {
  if (!Number.isInteger(movement.amountPence) || movement.amountPence === 0)
    throw new SupportError(
      400,
      "Credit amount must be a whole, non-zero number of pence",
    );
  await c.query(
    "INSERT INTO credit_accounts(tenant_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [movement.tenantId, movement.userId],
  );
  const account = (
    await c.query<{ balance_pence: number }>(
      "SELECT balance_pence FROM credit_accounts WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE",
      [movement.tenantId, movement.userId],
    )
  ).rows[0]!;
  // Same key seen before: return what happened then, change nothing now.
  const prior = (
    await c.query<{
      id: string;
      balance_after_pence: number;
      amount_pence: number;
    }>(
      "SELECT id, balance_after_pence, amount_pence FROM credit_transactions WHERE tenant_id=$1 AND idempotency_key=$2",
      [movement.tenantId, movement.idempotencyKey],
    )
  ).rows[0];
  if (prior) {
    if (prior.amount_pence !== movement.amountPence)
      throw new SupportError(
        409,
        "That credit change was already recorded with a different amount",
      );
    return {
      id: prior.id,
      balancePence: account.balance_pence,
      duplicate: true,
    };
  }
  const next = account.balance_pence + movement.amountPence;
  if (next < 0) throw new SupportError(409, "Not enough store credit");
  const id = (
    await c.query<{ id: string }>(
      `INSERT INTO credit_transactions(tenant_id,user_id,amount_pence,kind,reference,note,idempotency_key,balance_after_pence,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        movement.tenantId,
        movement.userId,
        movement.amountPence,
        movement.kind,
        movement.reference ?? null,
        movement.note ?? null,
        movement.idempotencyKey,
        next,
        movement.createdBy ?? null,
      ],
    )
  ).rows[0]!.id;
  await c.query(
    "UPDATE credit_accounts SET balance_pence=$3, updated_at=now() WHERE tenant_id=$1 AND user_id=$2",
    [movement.tenantId, movement.userId, next],
  );
  return { id, balancePence: next, duplicate: false };
}

export async function creditBalance(c: Tx, tenantId: string, userId: string) {
  return (
    (
      await c.query<{ balance_pence: number }>(
        "SELECT balance_pence FROM credit_accounts WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, userId],
      )
    ).rows[0]?.balance_pence ?? 0
  );
}

export async function creditHistory(
  c: Tx,
  tenantId: string,
  userId: string,
  limit = 50,
) {
  return (
    await c.query(
      `SELECT id, amount_pence AS "amountPence", kind, reference, note, balance_after_pence AS "balanceAfterPence", created_at AS "createdAt"
       FROM credit_transactions WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC, id DESC LIMIT $3`,
      [tenantId, userId, limit],
    )
  ).rows;
}
