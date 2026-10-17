import Link from "next/link";
import { Bell } from "lucide-react";

import MarkSeen from "@/components/account/mark-seen";
import styles from "@/components/account/account.module.css";
import { kushApi } from "@/lib/server/kush-api";
import { requireAccount } from "@/lib/server/session";
import { dateTime } from "@/lib/workspace";

interface Feed {
  notifications: { id: string; text: string; href: string; createdAt: string; unread: boolean }[];
  unread: number;
}

export default async function NotificationsPage() {
  const { token } = await requireAccount();
  const { notifications, unread } = await kushApi<Feed>("/web/account/notifications", { token });
  return (
    <>
      <p className={styles.kicker}>NOTIFICATIONS</p>
      <h1 className={styles.title}>
        Stay <em>updated.</em>
      </h1>
      <p className={styles.lede}>
        Replies, status changes and documents from KUSH. You also get these as private Discord messages.
      </p>
      {notifications.length === 0 ? (
        <div className={styles.empty}>
          <Bell size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
          <p className={styles.emptyTitle}>You&apos;re all caught up</p>
          <p className={styles.emptyText}>Updates about your tickets, commissions and applications will appear here.</p>
        </div>
      ) : (
        <>
          {notifications.map((n) => (
            <Link key={n.id} href={n.href} className={styles.listLink}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{n.text}</p>
                <p className={styles.rowMeta}>{dateTime.format(new Date(n.createdAt))}</p>
              </div>
              {n.unread ? <span className={`${styles.badge} ${styles.badgeOn}`}>NEW</span> : null}
            </Link>
          ))}
          {unread > 0 ? <MarkSeen /> : null}
        </>
      )}
    </>
  );
}
