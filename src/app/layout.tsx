import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";

import RevealController from "@/components/site/reveal-controller";

import "./globals.css";

// Display face: Archivo's width axis gives the expanded, fast feel of the
// KUSH wordmark without imitating it.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
  variable: "--font-archivo",
  display: "swap",
});
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const siteUrl = process.env.KUSH_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "KUSH — Independent creative technology studio",
    template: "%s — KUSH",
  },
  description:
    "KUSH designs and builds custom software, websites, web applications and creative work. An independent studio, established 2026.",
  applicationName: "KUSH",
  openGraph: {
    type: "website",
    siteName: "KUSH",
    images: [{ url: "/brand/kush-logo.png", width: 512, height: 512, alt: "KUSH" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={`${archivo.variable} ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks JS as running before first paint, so reveal-on-scroll never
            hides content for visitors without JavaScript. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <RevealController />
        {children}
      </body>
    </html>
  );
}
