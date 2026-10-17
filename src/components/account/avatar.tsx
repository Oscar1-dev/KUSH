import type { Account } from "@/lib/server/session";

import styles from "./account.module.css";

/** Discord avatar from Discord's CDN, or the account initial. */
export function Avatar({ account, size = 56 }: { account: Account; size?: number }) {
  const { discord } = account;
  const initial = (account.displayName ?? discord?.username ?? "K").slice(0, 1).toUpperCase();
  const src =
    discord?.avatar && /^(a_)?[a-f0-9]{32}$/.test(discord.avatar)
      ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png?size=128`
      : null;
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny external avatar */}
      {src ? <img src={src} alt="" width={size} height={size} /> : initial}
    </span>
  );
}
