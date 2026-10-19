import type { Metadata } from "next";
import Link from "next/link";

import { Owner, PolicyPage } from "@/components/site/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What KUSH collects, why, how long it's kept and your rights.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy"
      title={["Your data,", "kept simple."]}
      lede="What we collect, why we need it, and what you can ask us to do with it."
      updated="19 October 2026"
    >
      <h2>Who is responsible</h2>
      <p>
        <Owner>owner&apos;s legal or trading name and contact address</Owner> is the data controller for KUSH. Contact
        us through a <Link href="/account/support/new">support ticket</Link> or <Owner>privacy contact email</Owner>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Discord account:</strong> your Discord ID, username and avatar, when you sign in or use our Discord server.</li>
        <li><strong>Account security:</strong> sign-in sessions (device and browser), and an encrypted two-factor secret if you turn 2FA on.</li>
        <li><strong>What you send us:</strong> commission briefs, support tickets, messages and files.</li>
        <li><strong>Orders:</strong> what you bought, amounts, and payment references from Stripe. Card details go to Stripe only; we never see or store them.</li>
        <li><strong>Referrals:</strong> who joined the Discord through whose invite or code, when, and whether they stayed, so rewards can be checked fairly.</li>
        <li><strong>Server moderation:</strong> rule acceptance and moderation records in our Discord server.</li>
        <li><strong>Staff applicants:</strong> what you put in your application, and a signed NDA if you&apos;re accepted.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide what you asked for: your account, commissions, orders, downloads and support (contract).</li>
        <li>To keep accounts and payments secure and stop fraud or referral abuse (legitimate interests).</li>
        <li>To keep financial records we&apos;re required to keep (legal obligation).</li>
      </ul>
      <p>We don&apos;t sell your data, and we don&apos;t use advertising trackers.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>Stripe</strong>, to take payments.</li>
        <li><strong>Discord</strong>, because our community and bot run there.</li>
        <li><strong>Hosting provider</strong> <Owner>name once chosen</Owner>, who stores our database.</li>
        <li><strong>Partners</strong> working on your commission, only what they need, and only when your quote says a partner is involved.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data: while your account is open, then deleted or anonymised. <Owner>confirm period</Owner></li>
        <li>Order and payment records: <Owner>e.g. 6 years</Owner> for tax and accounting.</li>
        <li>Support tickets and commission records: <Owner>confirm period</Owner> after they close.</li>
        <li>Expired sign-in sessions and one-time codes are removed automatically.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct or delete it, object to how we use it, or ask us to
        restrict it. Open a ticket and we&apos;ll respond within a month. If you&apos;re unhappy with how we handle your
        data you can complain to <Owner>supervisory authority, e.g. the ICO in the UK</Owner>.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one essential cookie to keep you signed in, and one short-lived cookie during Discord sign-in. No
        analytics or advertising cookies.
      </p>
    </PolicyPage>
  );
}
