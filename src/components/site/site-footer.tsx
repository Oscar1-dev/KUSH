import Link from "next/link";

import { services } from "@/lib/site-content";
import styles from "./site.module.css";
import Wordmark from "./wordmark";

const columns = [
  { title: "Services", links: services.map((service) => ({ href: `/services/${service.slug}`, label: service.name })) },
  {
    title: "Studio",
    links: [
      { href: "/work", label: "Work" },
      { href: "/about", label: "About" },
      { href: "/vouches", label: "Vouches" },
      { href: "/careers", label: "Careers" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/commission", label: "Start a project" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
      { href: "/account", label: "Your account" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.footerTop}>
          <div className={styles.footerLead}>
            <Wordmark height={44} live />
            <p>Independent creative technology studio. Software, websites and creative work, built properly.</p>
          </div>
          {columns.map((column) => (
            <div key={column.title} className={styles.footerCol}>
              <p className="eyebrow">{column.title}</p>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.footerBottom}>
          <span className="mono">© {new Date().getFullYear()} KUSH. All rights reserved.</span>
          <span className="mono">Est. 2026 · Independent</span>
        </div>
      </div>
    </footer>
  );
}
