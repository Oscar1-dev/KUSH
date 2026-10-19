import type { Metadata } from "next";
import Link from "next/link";

import { Owner, PolicyPage } from "@/components/site/legal";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using KUSH, buying products and commissioning work.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Terms"
      title={["Terms of", "service."]}
      lede="The deal between you and KUSH, in plain English."
      updated="19 October 2026"
    >
      <h2>Who we are</h2>
      <p>
        KUSH is a digital services studio run by <Owner>owner&apos;s legal or trading name</Owner>, based in{" "}
        <Owner>country / registered address</Owner>. You can reach us through a{" "}
        <Link href="/account/support/new">support ticket</Link> or our Discord. In these terms &quot;we&quot; means KUSH and
        &quot;you&quot; means the person or business using our services.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You sign in with Discord. Keep your Discord account secure; anything done through it is treated as you.</li>
        <li>Staff accounts must use two-factor authentication.</li>
        <li>You must be at least 13 (Discord&apos;s minimum age), and old enough to make purchases where you live, or have a parent or guardian&apos;s permission.</li>
        <li>We can suspend accounts used for fraud, abuse, chargeback abuse or breaking the server rules.</li>
      </ul>

      <h2>Commissions</h2>
      <ul>
        <li>An enquiry is not an order. We review it and send a written quote with the price, what you get, the number of revision rounds and how long the quote is valid.</li>
        <li>Nothing is charged until you accept a quote and pay it. Work starts once payment is received.</li>
        <li>Revisions are included up to the number in your quote. Changes outside the agreed scope are quoted separately.</li>
        <li>Timelines are estimates and depend on you replying and supplying what we need (content, logins, assets).</li>
        <li>Some services rely on third parties (hosting, domains, game servers, app stores, partner creatives). Their costs and terms are separate, and we&apos;ll tell you in the quote when a service depends on a partner.</li>
      </ul>

      <h2>Products and downloads</h2>
      <ul>
        <li>Prices are shown in GBP at checkout and charged by Stripe. We never see your card details.</li>
        <li>Buying a product gives you a personal licence to use it as described on its page. You may not resell or redistribute it unless that page says you can.</li>
        <li>Download links are personal and expire. Don&apos;t share them.</li>
      </ul>

      <h2>Ownership</h2>
      <p>
        Once a commission is paid in full, you own the finished deliverables made specifically for you. We keep the
        right to reuse general tools, code libraries and techniques we already had, and to show the work in our
        portfolio unless you ask us not to. Third-party assets (fonts, stock, plugins) stay under their own licences.
      </p>

      <h2>Store credit and referrals</h2>
      <ul>
        <li>Store credit can only be spent with KUSH. It has no cash value and can&apos;t be transferred or withdrawn.</li>
        <li>Referral rewards are given for genuine new members who meet the rules shown on your referrals page. Self-referrals, alternate accounts and paid or automated invites don&apos;t count.</li>
        <li>We may review, withhold or remove rewards obtained by abuse, and change the referral programme for the future (rewards already earned stay earned).</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        See the <Link href="/refunds">refund policy</Link>. Nothing in these terms affects your statutory rights.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You won&apos;t use KUSH work for anything illegal, to harass people, to cheat in games in ways that break their
        rules, or to collect people&apos;s data without permission. We can decline or stop any commission that would.
      </p>

      <h2>Liability</h2>
      <p>
        We do our work with reasonable care and skill. We&apos;re not liable for losses caused by third-party services,
        by changes you make after delivery, or for indirect losses such as lost profits. Our total liability for a
        commission or product is limited to what you paid for it. <Owner>owner to confirm with legal advice</Owner>
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms; the date below shows the latest version, and changes don&apos;t apply to orders you
        already placed. These terms are governed by the law of <Owner>jurisdiction, e.g. England and Wales</Owner>.
      </p>
    </PolicyPage>
  );
}
