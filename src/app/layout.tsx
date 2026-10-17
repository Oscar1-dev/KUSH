
import type { Metadata } from "next";

import SiteExperience from "@/components/site-experience";

import "./globals.css";
import "./experience.css";

export const metadata: Metadata = {
  title: "KUSH® — Built Different",

  description:
    "KUSH is an independent creative technology studio building expressive digital experiences, useful software and connected systems.",

  applicationName: "KUSH",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteExperience />
        {children}
      </body>
    </html>
  );
}
