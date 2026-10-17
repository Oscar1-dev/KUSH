# KUSH bot runtime

Source: `apps/discord-bot/src/index.ts`, `src/runtime/`, `src/supervisor.ts`.

## Running

```
pnpm --filter @kush/discord-bot build
pnpm --filter @kush/discord-bot start:supervised   # restarts on crash with backoff
```

Environment (secrets stay in the gitignored `.local/secrets/`, never in config or the repo):

| Variable                          | Purpose                                               |
| --------------------------------- | ----------------------------------------------------- |
| `DISCORD_BOT_TOKEN_FILE`          | Path to the bot token file (or `DISCORD_BOT_TOKEN`)   |
| `KUSH_COMPONENT_SECRET`           | ≥32 chars; signs user-scoped buttons and modals       |
| `KUSH_DISCORD_INTEGRATION_SECRET` | ≥32 chars; must equal the API's value                 |
| `KUSH_DISCORD_CONFIG`             | Optional; defaults to repo-root `.local/discord.json` |
| `KUSH_BOT_HEALTH_PORT`            | Optional; loopback health port, default 4321          |
| `KUSH_PREFIX_COMMANDS`            | `false` disables the Message Content intent request   |

## Commands

One registry (`src/runtime/registry.ts`) defines every command. The `!` prefix router and the slash fallbacks (`src/commands.ts`) are both generated from it, so they cannot drift apart. `!help` lists only the commands the caller may use. Commands whose backend is not connected yet say so explicitly and create nothing.

- **Authority** (`authority.ts`) maps the caller's roles via the stable role IDs. Administrators do not inherit support authority. Restricted members may only use help, rules, FAQ and ticket commands.
- **Privacy:** account-specific or administrative output goes by DM for `!` commands and as an ephemeral reply for slash commands. If DMs are closed the bot says so in the channel without leaking anything. Bot messages never ping anyone except the caller.
- **Rate limits:** 5 commands per 10 seconds per user, plus per-command cooldowns. A throttled user gets one notice per window.
- **Errors:** a handler failure returns a reference ID and logs details; internals are never posted.
- **Audit:** privileged commands (allowed, denied or failed), account links, applications and onboarding are logged and posted to `#bot-log` without message content.
- **Buttons and modals:** HMAC-signed, bound to the requesting user, expire after 10 minutes, and fit Discord's 100-character `custom_id` limit (an earlier encoding did not).

## Message Content intent

`!` commands need the privileged Message Content intent. The bot requests it. If Discord refuses (close code 4014, intent disabled in the Developer Portal), the bot reconnects without it and runs slash commands and buttons only. Health shows `prefixCommands.enabled: false` with the reason. **Verified live on 17 October 2026: the intent is currently disabled.** To enable it: Developer Portal → Applications → KUSH → Bot → Privileged Gateway Intents → Message Content Intent.

## Health and recovery

`GET http://127.0.0.1:4321/health` returns gateway, guild, API, prefix-command and command-count state. It returns 200 only when everything is `ok`; partial states are `degraded`, never healthy. The supervisor restarts crashes after 1 s, doubling to a 60 s cap, and resets after 10 minutes of stable running. It does not restart after a clean exit or a configuration error (exit 78). discord.js resumes gateway sessions itself; reconnects are counted.

Live smoke test (17 October 2026): the bot logged in as KUSH#8932, the guild was available, the intent fallback worked and the health endpoint answered. The API showed `down` because it was not running and the configuration pointed at port 4318 instead of 4310.
