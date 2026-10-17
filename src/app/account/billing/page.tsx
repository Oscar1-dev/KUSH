import { CreditCard } from "lucide-react";

import { EmptySection } from "@/components/account/empty-section";
import { requireAccount } from "@/lib/server/session";

export default async function Page() {
  await requireAccount();
  return (
    <EmptySection
      kicker="ORDERS &amp; BILLING"
      title="Orders &amp;"
      accent="billing."
      lede="Receipts, invoices and payment history."
      icon={CreditCard}
      emptyTitle="No orders yet"
      emptyText="KUSH is not taking payments online yet. When it does, every order and receipt will be listed here."
    />
  );
}
