"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Contact,
  FileSignature,
  Gavel,
  Gauge,
  LifeBuoy,
  Package,
  PenTool,
  ScrollText,
  Settings,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import styles from "@/components/account/account.module.css";

type Section =
  | "tickets"
  | "reports"
  | "commissions"
  | "applications"
  | "agreements"
  | "customers"
  | "operations"
  | "team"
  | "moderation"
  | "audit";

const links: { href: string; label: string; icon: typeof Gauge; section?: Section }[] = [
  { href: "/staff", label: "Overview", icon: Gauge },
  { href: "/staff/tickets", label: "Support tickets", icon: LifeBuoy, section: "tickets" },
  { href: "/staff/tickets?scope=reports", label: "Member reports", icon: ShieldAlert, section: "reports" },
  { href: "/staff/moderation", label: "Moderation & vouches", icon: Gavel, section: "moderation" },
  { href: "/staff/commissions", label: "Commissions", icon: PenTool, section: "commissions" },
  { href: "/staff/applications", label: "Applications", icon: UserPlus, section: "applications" },
  { href: "/staff/agreements", label: "Agreements", icon: FileSignature, section: "agreements" },
  { href: "/staff/customers", label: "Customers", icon: Contact, section: "customers" },
  { href: "/staff/catalog", label: "Products & orders", icon: Package, section: "operations" },
  { href: "/staff/team", label: "Team", icon: Users, section: "team" },
  { href: "/staff/operations", label: "Discord & operations", icon: Activity, section: "operations" },
  { href: "/staff/audit", label: "Audit log", icon: ScrollText, section: "audit" },
  { href: "/staff/settings", label: "Settings", icon: Settings, section: "operations" },
];

/** Shows only sections the API said this person may use. */
export default function StaffNav({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Staff">
      <p className={styles.navGroup}>OPERATIONS</p>
      {links
        .filter((link) => !link.section || sections.includes(link.section))
        .map(({ href, label, icon: Icon }) => {
          const path = href.split("?")[0]!;
          const current = path === "/staff" ? pathname === "/staff" : pathname.startsWith(path) && !href.includes("?");
          return (
            <Link key={href} href={href} className={styles.navLink} aria-current={current ? "page" : undefined}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      <p className={styles.navGroup}>YOU</p>
      <Link href="/account" className={styles.navLink}>
        ← Customer account
      </Link>
    </nav>
  );
}
