"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { services } from "@/lib/site-content";
import styles from "./site.module.css";
import Wordmark from "./wordmark";

const links = [
  { href: "/services", label: "Services" },
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/vouches", label: "Vouches" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the menu on navigation, and lock scrolling while it's open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={`${styles.header} ${scrolled || open ? styles.headerSolid : ""}`}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" className={styles.headerBrand} aria-label="KUSH home">
          <Wordmark height={24} />
        </Link>

        <nav className={styles.headerNav} aria-label="Main">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={styles.headerLink} aria-current={active(link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link href="/account" className={styles.headerAccount}>
            Account
          </Link>
          <Link href="/commission" className={styles.buttonSmall}>
            Start a project
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <span className={styles.menuIcon} data-open={open} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id="site-menu" className={styles.menu} data-open={open} hidden={!open}>
        <div className="container">
          <nav aria-label="Menu" className={styles.menuList}>
            {[{ href: "/", label: "Home" }, ...links, { href: "/faq", label: "FAQ" }].map((link, i) => (
              <Link key={link.href} href={link.href} className={styles.menuLink} style={{ "--i": i } as React.CSSProperties}>
                <span className="mono">{String(i).padStart(2, "0")}</span>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className={styles.menuServices}>
            <p className="eyebrow">Services</p>
            {services.map((service) => (
              <Link key={service.slug} href={`/services/${service.slug}`}>
                {service.name}
              </Link>
            ))}
          </div>
          <div className={styles.menuFoot}>
            <Link href="/account" className={styles.buttonGhost}>
              Account
            </Link>
            <Link href="/commission" className={styles.button}>
              Start a project
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
