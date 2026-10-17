import { Bell } from "lucide-react";

import { EmptySection } from "@/components/account/empty-section";
import { requireAccount } from "@/lib/server/session";

export default async function Page() {
  await requireAccount();
  return (
    <EmptySection
      kicker="NOTIFICATIONS"
      title="Stay"
      accent="updated."
      lede="Updates about your account, commissions and tickets."
      icon={Bell}
      emptyTitle="You're all caught up"
      emptyText="Notifications about your account, commissions and tickets will appear here."
    />
  );
}
