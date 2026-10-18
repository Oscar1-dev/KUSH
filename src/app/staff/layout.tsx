import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, ShieldX, WifiOff } from "lucide-react";

import SignOutButton from "@/components/account/sign-out-button";
import StaffNav from "@/components/staff/staff-nav";
import styles from "@/components/account/account.module.css";
import { has, roleLabel, staffGate } from "@/lib/server/staff";

export const metadata: Metadata = {
  title: "Staff — KUSH®",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const denial = {
  not_staff: {
    icon: ShieldX,
    title: "Staff only",
    text: "Your Discord account doesn't currently hold a KUSH staff role. If you've just been given one, wait a minute and refresh.",
    action: { href: "/account", label: "GO TO MY ACCOUNT" },
  },
  not_linked: {
    icon: ShieldX,
    title: "Discord not linked",
    text: "Staff tools use your linked Discord account. Sign out and sign in again with Discord.",
    action: { href: "/account", label: "GO TO MY ACCOUNT" },
  },
  mfa_setup_required: {
    icon: ShieldCheck,
    title: "Turn on two-factor first",
    text: "Every KUSH staff account must use an authenticator app. Discord sign-in alone is not enough for staff tools.",
    action: { href: "/account/security", label: "SET UP 2FA" },
  },
  discord_unavailable: {
    icon: WifiOff,
    title: "Can't confirm your roles",
    text: "Discord didn't answer, so staff access is paused rather than guessed. Try again in a moment.",
    action: { href: "/staff", label: "TRY AGAIN" },
  },
  error: {
    icon: WifiOff,
    title: "Staff tools unavailable",
    text: "Something went wrong reaching KUSH services. Try again shortly.",
    action: { href: "/staff", label: "TRY AGAIN" },
  },
} as const;

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const gate = await staffGate();

  if (!gate.ok) {
    const view = denial[gate.reason];
    const Icon = view.icon;
    return (
      <main className={styles.signIn}>
        <section className={styles.signInPanel} aria-labelledby="denied">
          <Icon size={30} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.kicker} style={{ marginTop: 20 }}>
            KUSH STAFF
          </p>
          <h1 id="denied" className={styles.title} style={{ fontSize: "clamp(38px, 7vw, 56px)" }}>
            {view.title}
          </h1>
          <p className={styles.lede} style={{ marginBottom: 26 }}>
            {view.text}
          </p>
          <Link href={view.action.href} className={`${styles.button} ${styles.buttonPrimary}`}>
            {view.action.label}
          </Link>
        </section>
      </main>
    );
  }

  const { me } = gate;
  const sections = [
    ...(has(me, "tickets.assigned") || has(me, "tickets.queue") || has(me, "tickets.all") ? (["tickets"] as const) : []),
    ...(has(me, "reports.handle") ? (["reports"] as const) : []),
    ...(has(me, "commissions.assigned") || has(me, "commissions.all") ? (["commissions"] as const) : []),
    ...(has(me, "applications.review") ? (["applications"] as const) : []),
    ...(has(me, "agreements.manage") ? (["agreements"] as const) : []),
    ...(has(me, "customers.view") ? (["customers"] as const) : []),
    ...(has(me, "operations.view") ? (["operations"] as const) : []),
    ...(has(me, "team.view") ? (["team"] as const) : []),
    ...(has(me, "audit.view") ? (["audit"] as const) : []),
  ];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/staff" className={styles.brand} aria-label="KUSH staff home">
          K<span>U</span>SH
          <span className={styles.brandTag}>STAFF OPERATIONS</span>
        </Link>
        <StaffNav sections={[...sections]} />
        <div className={styles.sidebarFoot}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {me.roles.map((role) => (
              <span key={role} className={`${styles.badge} ${styles.badgeOn}`}>
                {roleLabel[role].toUpperCase()}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 11 }}>Roles checked live with Discord · 2FA verified</span>
          <SignOutButton />
        </div>
      </aside>
      <main className={styles.main} id="main">
        {children}
      </main>
    </div>
  );
}
