import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, MessagesSquare, PenTool } from "lucide-react";

import { Arrow, PageHero } from "@/components/site/blocks";
import site from "@/components/site/site.module.css";

import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "Start a project, get support, or come and say hello in the KUSH Discord.",
};

// The Discord invite is configuration, not code: set KUSH_DISCORD_INVITE_URL.
const invite = process.env.KUSH_DISCORD_INVITE_URL;

export default function ContactPage() {
  const routes = [
    {
      icon: PenTool,
      title: "Start a project",
      text: "Got something in mind? Send a commission request and you'll get a quote in your account.",
      href: "/commission",
      action: "Start a request",
    },
    {
      icon: LifeBuoy,
      title: "Get support",
      text: "Problem with something you bought, a download or your account? Open a private ticket.",
      href: "/sign-in?next=/account/support/new",
      action: "Open a ticket",
    },
    {
      icon: MessagesSquare,
      title: "Join the Discord",
      text: invite
        ? "Chat with the community, ask questions in the open, or open a ticket with !ticket."
        : "Our Discord is where the community, support and vouches live. The public invite link is coming soon.",
      href: invite ?? null,
      action: "Join the server",
    },
  ];

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={["Say", "hello."]}
        lede="Pick whichever suits you. Every route ends up with a real person on the KUSH team, usually the one who'll do the work."
      />
      <section className={site.section}>
        <div className={`container ${styles.grid}`}>
          {routes.map(({ icon: Icon, ...route }, i) => {
            const body = (
              <>
                <span className={styles.icon}>
                  <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h2 className={styles.title}>{route.title}</h2>
                <p className={styles.text}>{route.text}</p>
                {route.href ? (
                  <span className={styles.action}>
                    {route.action} <Arrow />
                  </span>
                ) : (
                  <span className={`mono ${styles.soon}`}>Invite link coming soon</span>
                )}
              </>
            );
            const style = { "--reveal-i": i } as React.CSSProperties;
            if (!route.href)
              return (
                <div key={route.title} className={styles.card} data-reveal style={style}>
                  {body}
                </div>
              );
            const external = route.href.startsWith("http");
            return external ? (
              <a key={route.title} href={route.href} className={styles.card} data-reveal style={style} target="_blank" rel="noreferrer">
                {body}
              </a>
            ) : (
              <Link key={route.title} href={route.href} className={styles.card} data-reveal style={style}>
                {body}
              </Link>
            );
          })}
        </div>
        <div className="container">
          <p className={styles.note} data-reveal>
            Quick questions? The <Link href="/faq">FAQ</Link> probably has you covered.
          </p>
        </div>
      </section>
    </>
  );
}
