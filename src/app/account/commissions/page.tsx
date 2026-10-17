import { PenTool } from "lucide-react";

import { EmptySection } from "@/components/account/empty-section";
import { requireAccount } from "@/lib/server/session";

export default async function Page() {
  await requireAccount();
  return (
    <EmptySection
      kicker="MY COMMISSIONS"
      title="Your"
      accent="projects."
      lede="Website, software and creative commissions with KUSH: from enquiry and quote through to delivery."
      icon={PenTool}
      emptyTitle="Commission tracking is being connected"
      emptyText="Your commission history will appear here in the next update. Existing commissions are safe, and the KUSH team will keep you updated in Discord meanwhile."
    />
  );
}
