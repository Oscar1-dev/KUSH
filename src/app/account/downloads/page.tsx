import { Download } from "lucide-react";

import { EmptySection } from "@/components/account/empty-section";
import { requireAccount } from "@/lib/server/session";

export default async function Page() {
  await requireAccount();
  return (
    <EmptySection
      kicker="DOWNLOADS"
      title="Your"
      accent="downloads."
      lede="Secure downloads for products you own. Links are checked against your account every time."
      icon={Download}
      emptyTitle="Nothing to download yet"
      emptyText="When you own a KUSH product with downloads, they will be available here."
    />
  );
}
