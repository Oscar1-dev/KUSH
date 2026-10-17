import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";
import { dateOnly, dateTime } from "@/lib/workspace";

interface Customer {
  id: string;
  name: string;
  discordId: string | null;
  createdAt: string;
  disabled: boolean;
  tickets: number;
  commissions: number;
  products: number;
  lastSeenAt: string | null;
}

export default async function StaffCustomers() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "customers.view")) return <p className={styles.lede}>Customer records are for managers and administrators.</p>;
  const { customers } = await kushApi<{ customers: Customer[] }>("/web/staff/customers", { token: gate.token });
  return (
    <>
      <p className={styles.kicker}>CUSTOMERS</p>
      <h1 className={styles.title}>
        Who we <em>serve.</em>
      </h1>
      <p className={styles.lede}>{customers.length} KUSH accounts. Personal details stay on the record they belong to.</p>
      {customers.map((c) => (
        <div key={c.id} className={styles.row}>
          <div className={styles.rowMain}>
            <p className={styles.rowTitle}>
              {c.name} {c.disabled ? <span className={styles.badge}>DISABLED</span> : null}
            </p>
            <p className={styles.rowMeta}>
              Joined {dateOnly.format(new Date(c.createdAt))}
              {c.lastSeenAt ? ` · last on the website ${dateTime.format(new Date(c.lastSeenAt))}` : " · not used the website yet"}
              {c.discordId ? ` · Discord ${c.discordId}` : ""}
            </p>
          </div>
          <p className={styles.rowMeta} style={{ whiteSpace: "nowrap" }}>
            {c.tickets} tickets · {c.commissions} commissions · {c.products} products
          </p>
        </div>
      ))}
    </>
  );
}
