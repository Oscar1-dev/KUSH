import { LifeBuoy } from "lucide-react";

import { EmptySection } from "@/components/account/empty-section";
import { requireAccount } from "@/lib/server/session";

export default async function Page() {
  await requireAccount();
  return (
    <EmptySection
      kicker="SUPPORT TICKETS"
      title="Talk to"
      accent="the team."
      lede="Your conversations with KUSH support, whether you started them here or in Discord."
      icon={LifeBuoy}
      emptyTitle="Ticket history is being connected"
      emptyText="Your tickets will appear here in the next update. You can open and follow tickets in the KUSH Discord now."
    />
  );
}
