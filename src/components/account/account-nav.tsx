"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CreditCard,
  Download,
  LayoutGrid,
  LifeBuoy,
  MessagesSquare,
  MonitorSmartphone,
  Package,
  PenTool,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import styles from "./account.module.css";

const groups = [
  {
    label: "ACCOUNT",
    links: [
      { href: "/account", label: "Overview", icon: LayoutGrid },
      { href: "/account/profile", label: "My Account", icon: UserRound },
      { href: "/account/security", label: "Security & 2FA", icon: ShieldCheck },
      { href: "/account/discord", label: "Linked Discord", icon: MessagesSquare },
      { href: "/account/sessions", label: "Active Sessions", icon: MonitorSmartphone },
    ],
  },
  {
    label: "WORK WITH KUSH",
    links: [
      { href: "/account/commissions", label: "My Commissions", icon: PenTool },
      { href: "/account/support", label: "Support Tickets", icon: LifeBuoy },
      { href: "/account/billing", label: "Orders & Billing", icon: CreditCard },
    ],
  },
  {
    label: "LIBRARY",
    links: [
      { href: "/account/products", label: "My Products", icon: Package },
      { href: "/account/downloads", label: "Downloads", icon: Download },
      { href: "/account/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

export default function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Account">
      {groups.map((group) => (
        <div key={group.label} style={{ display: "contents" }}>
          <p className={styles.navGroup}>{group.label}</p>
          {group.links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={styles.navLink}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
