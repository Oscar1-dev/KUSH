import type { Metadata } from "next";
import Link from "next/link";

import { Owner, PolicyPage } from "@/components/site/legal";

export const metadata: Metadata = {
  title: "Refund policy",
  description: "When KUSH refunds products and commissions, and how to ask.",
};

export default function RefundsPage() {
  return (
    <PolicyPage
      eyebrow="Refunds"
      title={["Refund", "policy."]}
      lede="Fair to you and to the people doing the work."
      updated="19 October 2026"
    >
      <h2>How to ask</h2>
      <p>
        Open a <Link href="/account/support/new">support ticket</Link> with your order number (it&apos;s on your{" "}
        <Link href="/account/orders">orders page</Link>) and tell us what went wrong. We aim to reply within{" "}
        <Owner>e.g. 2 working days</Owner>.
      </p>

      <h2>Digital products</h2>
      <ul>
        <li>Downloads start immediately, so by buying one you agree it&apos;s supplied straight away and the usual 14-day cancellation right doesn&apos;t apply once you&apos;ve downloaded it.</li>
        <li>If a product doesn&apos;t work as described and we can&apos;t fix it, you get a full refund.</li>
        <li>If you haven&apos;t downloaded it yet, ask within 14 days for a full refund.</li>
      </ul>

      <h2>Commissions</h2>
      <ul>
        <li><strong>Before work starts:</strong> full refund.</li>
        <li><strong>Once work has started:</strong> we refund the part of the price for work not yet done. Work already delivered or in progress is kept.</li>
        <li><strong>After delivery:</strong> if what we delivered doesn&apos;t match the agreed quote, we&apos;ll fix it first (that&apos;s what revisions are for). If we can&apos;t, we refund fairly for the part that falls short.</li>
        <li>Changing your mind about the idea after it&apos;s been built to the agreed brief isn&apos;t grounds for a refund, but we&apos;re always happy to quote changes.</li>
        <li>Third-party costs we paid on your behalf (domains, hosting, assets, partner fees) can only be refunded if the provider refunds them.</li>
      </ul>

      <h2>How refunds are paid</h2>
      <ul>
        <li>Card payments go back to the same card through Stripe. Banks usually take 5 to 10 working days to show it.</li>
        <li>Anything paid with store credit is returned as store credit.</li>
        <li>Rewards earned through referrals can&apos;t be refunded as cash.</li>
      </ul>

      <h2>Chargebacks</h2>
      <p>
        Please talk to us before disputing a payment with your bank; it&apos;s faster for you. Accounts used for
        chargebacks on work that was delivered as agreed may be suspended.
      </p>

      <p>Nothing here affects your statutory rights as a consumer.</p>
    </PolicyPage>
  );
}
