import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { creditLabel, money, orderLabel, type CreditEntry, type OrderStatus, type ReferralSummary } from "@/lib/commerce";
import { ApiError, kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { commissionLabel, dateOnly, dateTime, ticketLabel, type CommissionStatus, type TicketStatus } from "@/lib/workspace";

interface Customer360 {
  customer: { id: string; name: string; username: string | null; createdAt: string; disabled: boolean; discordId: string | null };
  orders: { id: string; number: number; description: string; status: OrderStatus; subtotalPence: number; createdAt: string }[] | null;
  commissions: { id: string; title: string; category: string; status: CommissionStatus; updatedAt: string }[];
  tickets: { id: string; number: number; category: string; status: TicketStatus; updatedAt: string }[];
  credit: { balancePence: number; history: CreditEntry[] };
  referrals: ReferralSummary | null;
  roles: {
    grants: { roleKey: string; state: "granted" | "revoked"; reason: string; updatedAt: string }[];
    history: { roleKey: string; state: string; reason: string; source: "website" | "discord"; createdAt: string; by: string }[];
    grantable: { key: string; label: string }[];
  } | null;
  moderation: { number: number; kind: string; reason: string; createdAt: string }[] | null;
  can: { adjustCredit: boolean; manageRoles: boolean };
}

export default async function StaffCustomer({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "customers.view")) return <p className={styles.lede}>Customer records are for managers and administrators.</p>;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let data: Customer360;
  try {
    data = await kushApi<Customer360>(`/web/staff/customers/${id}`, { token: gate.token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { customer, credit, roles } = data;
  const label = (key: string) => roles?.grantable.find((role) => role.key === key)?.label ?? key;

  return (
    <>
      <Link href="/staff/customers" className={styles.rowMeta}>
        ← Customers
      </Link>
      <div className={styles.headerRow} style={{ marginTop: 22 }}>
        <div>
          <p className={styles.kicker}>CUSTOMER</p>
          <h1 className={styles.title} style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}>
            {customer.name}
          </h1>
        </div>
        {customer.disabled ? <span className={styles.badge}>DISABLED</span> : null}
      </div>
      <p className={styles.rowMeta} style={{ marginBottom: 26 }}>
        Joined {dateOnly.format(new Date(customer.createdAt))}
        {customer.username ? ` · Discord @${customer.username}` : ""}
        {customer.discordId ? ` (${customer.discordId})` : " · Discord not connected"}
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>STORE CREDIT</p>
          <p className={styles.cardValue}>{money(credit.balancePence)}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>COMMISSIONS</p>
          <p className={styles.cardValue}>{data.commissions.length}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>TICKETS</p>
          <p className={styles.cardValue}>{data.tickets.length}</p>
        </div>
        {data.referrals?.linked ? (
          <div className={styles.card}>
            <p className={styles.cardLabel}>QUALIFIED REFERRALS</p>
            <p className={styles.cardValue}>{data.referrals.qualified ?? 0}</p>
          </div>
        ) : null}
      </div>

      <div className={styles.split} style={{ marginTop: 28 }}>
        <div>
          <section className={styles.section} style={{ marginTop: 0 }}>
            <h2 className={styles.sectionTitle}>Commissions</h2>
            {data.commissions.length === 0 ? <p className={styles.cardText}>None.</p> : null}
            {data.commissions.map((c) => (
              <Link key={c.id} href={`/staff/commissions/${c.id}`} className={styles.listLink}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{c.title}</p>
                  <p className={styles.rowMeta}>updated {dateTime.format(new Date(c.updatedAt))}</p>
                </div>
                <span className={styles.badge}>{commissionLabel[c.status].toUpperCase()}</span>
              </Link>
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tickets</h2>
            {data.tickets.length === 0 ? <p className={styles.cardText}>None.</p> : null}
            {data.tickets.map((t) => (
              <Link key={t.id} href={`/staff/tickets/${t.id}`} className={styles.listLink}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    #{t.number} · {t.category}
                  </p>
                  <p className={styles.rowMeta}>updated {dateTime.format(new Date(t.updatedAt))}</p>
                </div>
                <span className={styles.badge}>{ticketLabel[t.status].toUpperCase()}</span>
              </Link>
            ))}
          </section>

          {data.orders ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Orders</h2>
              {data.orders.length === 0 ? <p className={styles.cardText}>None.</p> : null}
              {data.orders.map((o) => (
                <Link key={o.id} href={`/staff/orders/${o.id}`} className={styles.listLink}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>
                      #{o.number} · {o.description}
                    </p>
                    <p className={styles.rowMeta}>
                      {money(o.subtotalPence)} · {dateOnly.format(new Date(o.createdAt))}
                    </p>
                  </div>
                  <span className={styles.badge}>{orderLabel[o.status].toUpperCase()}</span>
                </Link>
              ))}
            </section>
          ) : null}

          {data.moderation ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Moderation cases</h2>
              {data.moderation.length === 0 ? <p className={styles.cardText}>None.</p> : null}
              {data.moderation.map((m) => (
                <div key={m.number} className={styles.row}>
                  <span>
                    #{m.number} · {m.kind}
                    <span className={styles.rowMeta} style={{ display: "block" }}>
                      {m.reason}
                    </span>
                  </span>
                  <span className={styles.rowMeta}>{dateOnly.format(new Date(m.createdAt))}</span>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <aside className={styles.form} style={{ maxWidth: "none" }}>
          <div className={styles.card}>
            <p className={styles.cardLabel}>CREDIT LEDGER</p>
            {credit.history.length === 0 ? <p className={styles.cardText}>No credit activity.</p> : null}
            {credit.history.map((entry) => (
              <div key={entry.id} className={styles.row}>
                <span>
                  {creditLabel[entry.kind]}
                  <span className={styles.rowMeta} style={{ display: "block" }}>
                    {dateTime.format(new Date(entry.createdAt))}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                </span>
                <span>
                  {entry.amountPence > 0 ? "+" : "−"}
                  {money(Math.abs(entry.amountPence))}
                </span>
              </div>
            ))}
            {data.can.adjustCredit ? (
              <div key={`adjust-${credit.balancePence}-${credit.history.length}`} style={{ marginTop: 16 }}>
                <ActionForm action="adjustCredit" hidden={{ userId: customer.id, requestId: randomUUID() }} submit="RECORD ADJUSTMENT" tone="plain">
                  <div className={styles.formRow}>
                    <select name="direction" className={styles.input} aria-label="Add or remove">
                      <option value="add">Add credit</option>
                      <option value="remove">Remove credit</option>
                    </select>
                    <input name="price" className={styles.input} required inputMode="decimal" placeholder="£ amount" aria-label="Amount in pounds" />
                  </div>
                  <input name="note" className={styles.input} required minLength={3} maxLength={500} placeholder="Reason (shown to the customer)" aria-label="Reason" />
                  <p className={styles.rowMeta}>
                    Every change is a ledger entry with your name. Credit is not cash, can&apos;t go below zero and
                    can&apos;t be withdrawn.
                  </p>
                </ActionForm>
              </div>
            ) : null}
          </div>

          {roles ? (
            <div className={styles.card}>
              <p className={styles.cardLabel}>DISCORD ROLES</p>
              {roles.grants.length === 0 ? <p className={styles.cardText}>None granted from KUSH.</p> : null}
              {roles.grants.map((grant) => (
                <div key={grant.roleKey} className={styles.row}>
                  <span>
                    {label(grant.roleKey)}
                    <span className={styles.rowMeta} style={{ display: "block" }}>
                      {grant.reason}
                    </span>
                  </span>
                  <span className={`${styles.badge} ${grant.state === "granted" ? styles.badgeOn : ""}`}>
                    {grant.state.toUpperCase()}
                  </span>
                </div>
              ))}
              {data.can.manageRoles ? (
                <div key={`roles-${roles.history.length}`} style={{ marginTop: 16 }}>
                  <ActionForm action="roleChange" hidden={{ userId: customer.id, requestId: randomUUID() }} submit="APPLY" tone="plain">
                    <div className={styles.formRow}>
                      <select name="action" className={styles.input} aria-label="Grant or revoke">
                        <option value="grant">Grant</option>
                        <option value="revoke">Revoke</option>
                      </select>
                      <select name="roleKey" className={styles.input} aria-label="Role">
                        {roles.grantable.map((role) => (
                          <option key={role.key} value={role.key}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input name="reason" className={styles.input} required minLength={3} maxLength={300} placeholder="Reason (audit log)" aria-label="Reason" />
                    <p className={styles.rowMeta}>
                      Same as <code>/staff role</code> in Discord. Staff roles can&apos;t be granted here.
                    </p>
                  </ActionForm>
                </div>
              ) : null}
              {roles.history.length ? (
                <>
                  <p className={styles.cardLabel} style={{ marginTop: 18 }}>
                    HISTORY
                  </p>
                  {roles.history.map((event, index) => (
                    <p key={index} className={styles.rowMeta}>
                      {dateTime.format(new Date(event.createdAt))} · {event.by} {event.state} {label(event.roleKey)} (
                      {event.source})
                    </p>
                  ))}
                </>
              ) : null}
            </div>
          ) : (
            <div className={styles.card}>
              <p className={styles.cardLabel}>DISCORD ROLES</p>
              <p className={styles.cardText}>This customer hasn&apos;t connected Discord yet.</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
