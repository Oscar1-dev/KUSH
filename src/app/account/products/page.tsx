import { Package } from "lucide-react";

import { EmptySection } from "@/components/account/empty-section";
import { requireAccount } from "@/lib/server/session";

export default async function Page() {
  await requireAccount();
  return (
    <EmptySection
      kicker="MY PRODUCTS"
      title="Your"
      accent="library."
      lede="Everything you own from KUSH, with its licence and access status."
      icon={Package}
      emptyTitle="No products yet"
      emptyText="KUSH has no products on sale yet. Anything you buy in future will appear here and unlock in Discord automatically."
    />
  );
}
