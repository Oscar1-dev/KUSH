import {
  ApiError,
  requestUuid,
  type CommissionTarget,
  type Order,
} from "../api-client.js";
import { card, embed } from "../panels.js";
import { hasAuthority } from "../runtime/authority.js";
import { say } from "../ui/kit.js";
import {
  CommandError,
  type CommandContext,
  type CommandDefinition,
} from "../runtime/command.js";
import {
  commissionServiceMenu,
  fallbackCommissionChoices,
  payButton,
  type CommissionChoice,
} from "../runtime/components.js";

/**
 * Shop, orders, store credit, referrals, commissions and staff tools.
 * The bot only relays: prices, payment state, permissions and rewards are
 * all decided by the KUSH API. Money never moves from a Discord command
 * except through Stripe Checkout, which the customer completes themselves.
 */

const MENTION = /^<@!?(\d{17,20})>$/;
const TICKET = /^#(\d{1,9})$/;
const ORDER = /^#?(\d{1,9})$/;

export const money = (pence: number) =>
  `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;

/** "15", "£15", "15.50" → pence; null if it isn't a price. */
export function parsePrice(value: string): number | null {
  const match = /^£?(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

const label = (value: string) => value.replaceAll("_", " ");

/** Roles staff may grant (blueprint.staffGrantableRoles), with their names. */
const grantableChoices = [
  { name: "Customer", value: "verified-customer" },
  { name: "Beta Tester", value: "beta-tester" },
  { name: "Creative Team", value: "creative-partner" },
  { name: "Verified Seller", value: "approved-seller" },
  { name: "Reseller", value: "verified-reseller" },
] as const;

const signer = (context: CommandContext) => ({
  secret: context.services.componentSecret,
  now: context.services.now(),
});

/** Account-specific output: DM (prefix) or ephemeral (slash). */
async function privately(
  context: CommandContext,
  message: Parameters<CommandContext["replyPrivately"]>[0],
) {
  const delivery = await context.replyPrivately(message);
  if (context.source === "prefix")
    await context.reply({
      content:
        delivery === "dm"
          ? "I've sent you the details by direct message."
          : "I couldn't DM you. Enable DMs from server members, or use the slash command (its replies are private).",
    });
}

/** `#42` anywhere in the args, else the ticket channel it was run in. */
function targetOf(context: CommandContext, args: string[]) {
  const explicit = args.map((arg) => TICKET.exec(arg)?.[1]).find(Boolean);
  const target: CommissionTarget = explicit
    ? { ticket: Number(explicit) }
    : { channelId: context.channelId };
  return {
    target,
    rest: args.filter((arg) => !TICKET.test(arg)),
  };
}

const orderLine = (order: Order) =>
  `**#${order.number}** · ${order.description.slice(0, 60)} · ${money(order.subtotalPence)} · ${label(order.status)}`;

const isStaff = (context: CommandContext) =>
  hasAuthority(context.actor, "staff");

/** Live catalogue services for the picker; a fixed list if the API is down. */
export async function loadCommissionChoices(
  api: CommandContext["services"]["api"],
): Promise<CommissionChoice[]> {
  try {
    // Interactions must be answered within 3 seconds: don't wait long.
    const services = await Promise.race([
      api.catalogue(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("slow")), 1_500),
      ),
    ]);
    const choices = services.map((service) => ({
      category: service.category,
      label: service.name,
      hint: service.startingPrice,
    }));
    return choices.length ? choices : fallbackCommissionChoices;
  } catch {
    return fallbackCommissionChoices;
  }
}

// --------------------------------------------------------------- customers

const customerCommands: CommandDefinition[] = [
  {
    path: ["products"],
    aliases: [["shop"]],
    group: "Community",
    authority: "everyone",
    cooldownMs: 10_000,
    summary: "Products and services you can buy from KUSH",
    usage: "!products",
    run: async (context) => {
      const [products, services] = await Promise.all([
        context.services.api.products(),
        context.services.api.catalogue().catch(() => []),
      ]);
      const embeds = [
        card({
          title: "KUSH products",
          emoji: "📦",
          tone: "info",
          description: products.length
            ? products
                .slice(0, 15)
                .map(
                  (product) =>
                    `**${product.name}** · ${money(product.pricePence)}\n${product.description.slice(0, 120) || "​"}\nBuy: \`/buy product:${product.slug}\``,
                )
                .join("\n\n")
            : "Nothing is on sale right now. Commissions are open: `/commission create`.",
        }),
      ];
      if (services.length)
        embeds.push(
          card({
            title: "Commissions",
            emoji: "🛠️",
            tone: "brand",
            description: services
              .map(
                (service) =>
                  `**${service.name}** · ${service.startingPrice ?? "Quoted individually"}`,
              )
              .join("\n"),
            footer:
              "Final prices are agreed in a written quote before any work starts.",
          }),
        );
      await context.reply({ embeds });
    },
  },
  {
    path: ["buy"],
    group: "Customers",
    authority: "member",
    cooldownMs: 10_000,
    summary: "Buy a product (opens Stripe's secure checkout)",
    usage: "!buy <product>",
    options: [
      {
        name: "product",
        description: "Product code from /products",
        required: true,
      },
    ],
    run: async (context) => {
      const slug = context.args[0]?.toLowerCase();
      if (!slug || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug))
        throw new CommandError(
          "Usage: `!buy <product>`. See `/products` for product codes.",
        );
      const result = await context.services.api.checkout({
        discordUserId: context.actor.userId,
        productSlug: slug,
        // Same message or interaction → same order (no double charges).
        interactionId:
          context.invocationId ?? `${context.actor.userId}:${slug}`,
        useCredit: true,
      });
      const lines = [
        `Order **#${result.orderNumber}**`,
        result.creditAppliedPence
          ? `Store credit used: ${money(result.creditAppliedPence)}`
          : "",
        `To pay: **${money(result.totalPence)}**`,
      ].filter(Boolean);
      if (!result.checkoutUrl) {
        await privately(context, {
          embeds: [
            card({
              title:
                result.status === "paid"
                  ? "Paid with store credit"
                  : "Order created",
              emoji: "✅",
              tone: "success",
              description: [
                ...lines,
                result.status === "paid"
                  ? "It's in your KUSH account now."
                  : "Payment isn't available right now; nothing was charged.",
              ].join("\n"),
            }),
          ],
        });
        return;
      }
      await privately(context, {
        embeds: [
          card({
            title: "Checkout ready",
            emoji: "🛒",
            tone: "brand",
            description: [
              ...lines,
              "Pay on Stripe's secure page; KUSH never sees your card. The link expires in about an hour.",
            ].join("\n"),
          }),
        ],
        components: [payButton(result.checkoutUrl)],
      });
    },
  },
  {
    path: ["orders"],
    group: "Customers",
    authority: "member",
    cooldownMs: 5_000,
    summary: "Your recent KUSH orders (sent privately)",
    usage: "!orders",
    run: async (context) => {
      const orders = await context.services.api.orders(context.actor.userId);
      await privately(context, {
        embeds: [
          embed(
            "Your orders",
            orders.length
              ? orders.map(orderLine).join("\n")
              : "No orders yet. See `/products`.",
          ),
        ],
      });
    },
  },
  {
    path: ["order"],
    group: "Customers",
    authority: "member",
    cooldownMs: 5_000,
    summary: "One order with its payments and receipts (sent privately)",
    usage: "!order <number>",
    options: [
      {
        name: "number",
        description: "Order number",
        required: true,
        type: "integer",
        minValue: 1,
      },
    ],
    run: async (context) => {
      const number = ORDER.exec(context.args[0] ?? "")?.[1];
      if (!number) throw new CommandError("Usage: `!order <number>`");
      const order = await context.services.api.order(
        context.actor.userId,
        Number(number),
      );
      const receipts = (order.payments ?? [])
        .filter((payment) => payment.receiptUrl)
        .map(
          (payment, index) => `[Receipt ${index + 1}](${payment.receiptUrl})`,
        );
      await privately(context, {
        embeds: [
          card({
            title: `Order #${order.number}`,
            emoji: "🧾",
            tone: "info",
            description: order.description,
            fields: [
              { name: "Status", value: label(order.status), inline: true },
              {
                name: "Total",
                value: money(order.subtotalPence),
                inline: true,
              },
              ...(order.creditAppliedPence
                ? [
                    {
                      name: "Store credit",
                      value: money(order.creditAppliedPence),
                      inline: true,
                    },
                  ]
                : []),
              ...(order.refundedPence
                ? [
                    {
                      name: "Refunded",
                      value: money(order.refundedPence),
                      inline: true,
                    },
                  ]
                : []),
              ...(receipts.length
                ? [{ name: "Receipts", value: receipts.join(" · ") }]
                : []),
            ],
          }),
        ],
      });
    },
  },
  {
    path: ["credit"],
    aliases: [["balance"]],
    group: "Customers",
    authority: "member",
    cooldownMs: 5_000,
    summary: "Your KUSH store credit (sent privately)",
    usage: "!credit",
    run: async (context) => {
      const credit = await context.services.api.credit(context.actor.userId);
      await privately(context, {
        embeds: [
          card({
            title: "Store credit",
            emoji: "💳",
            tone: "brand",
            description: [
              `Balance: **${money(credit.balancePence)}**`,
              credit.spendable
                ? "Credit is used automatically at checkout. It can't be exchanged for cash."
                : "Credit is recorded on your account. It can't be spent at checkout yet, and it can't be exchanged for cash.",
              "",
              ...credit.history.map(
                (entry) =>
                  `${entry.amountPence > 0 ? "+" : "−"}${money(Math.abs(entry.amountPence))} · ${label(entry.kind)}${entry.reference ? ` · ${entry.reference}` : ""}`,
              ),
            ].join("\n"),
          }),
        ],
      });
    },
  },
];

// --------------------------------------------------------------- referrals

const referralCommands: CommandDefinition[] = [
  {
    path: ["referrals"],
    group: "Customers",
    authority: "member",
    cooldownMs: 5_000,
    summary: "Your referral code and progress (sent privately)",
    usage: "!referrals",
    run: async (context) => {
      const summary = await context.services.api.referralSummary(
        context.actor.userId,
      );
      await privately(context, {
        embeds: [
          card({
            title: "Your referrals",
            emoji: "🤝",
            tone: "brand",
            description: [
              `Your code: **${summary.code}**. New members enter it with \`/referral claim\`.`,
              `Qualified: **${summary.qualified}** · waiting: ${summary.pending} · under review: ${summary.underReview}`,
              summary.next
                ? `Next reward: **${summary.next.label}** in ${summary.next.remaining} more.`
                : "You've reached every milestone. Thank you!",
              "",
              `A referral counts once the member's account is at least ${summary.rules.minAccountAgeDays} days old and they've stayed ${summary.rules.minMembershipDays} days. Rewards: ${summary.milestones.map((m) => `${m.count} → ${m.label}`).join(" · ")}.`,
              summary.linked
                ? ""
                : "⚠️ Link your KUSH account (`!account`) so rewards can be added to it.",
            ]
              .filter((line) => line !== "")
              .join("\n"),
          }),
        ],
      });
    },
  },
  {
    path: ["referral", "rewards"],
    group: "Customers",
    authority: "member",
    cooldownMs: 5_000,
    summary: "Referral rewards you've earned (sent privately)",
    usage: "!referral rewards",
    run: async (context) => {
      const summary = await context.services.api.referralSummary(
        context.actor.userId,
      );
      await privately(context, {
        embeds: [
          embed(
            "Referral rewards",
            summary.rewards.length
              ? summary.rewards
                  .map(
                    (reward) =>
                      `**${reward.milestone} referrals** · ${label(reward.type)}${reward.valuePence ? ` (${money(reward.valuePence)})` : ""} · ${label(reward.status)}`,
                  )
                  .join("\n")
              : `None yet. ${summary.next ? `${summary.next.remaining} more qualified referrals to your first reward.` : ""}`,
          ),
        ],
      });
    },
  },
  {
    path: ["referral", "leaderboard"],
    group: "Community",
    authority: "member",
    cooldownMs: 30_000,
    summary: "Top referrers this server",
    usage: "!referral leaderboard",
    run: async (context) => {
      const leaders = await context.services.api.referralLeaderboard();
      await context.reply({
        embeds: [
          card({
            title: "Referral leaderboard",
            emoji: "🏆",
            tone: "brand",
            description: leaders.length
              ? leaders
                  .map(
                    (leader, index) =>
                      `**${index + 1}.** <@${leader.discordUserId}> · ${leader.qualified}`,
                  )
                  .join("\n")
              : "No qualified referrals yet. Get yours with `/referrals`.",
          }),
        ],
      });
    },
  },
  {
    path: ["referral", "claim"],
    group: "Community",
    authority: "member",
    cooldownMs: 30_000,
    summary: "Credit the member who invited you, with their code",
    usage: "!referral claim <code>",
    options: [
      { name: "code", description: "Their referral code", required: true },
    ],
    run: async (context) => {
      const code = context.args[0]?.trim().toUpperCase();
      if (!code) throw new CommandError("Usage: `!referral claim <code>`");
      const dates = await context.services.memberDates?.(context.actor.userId);
      if (!dates)
        throw new CommandError(
          "I couldn't read your server membership just now. Try again shortly.",
        );
      let status: string;
      try {
        status = (
          await context.services.api.referralClaim({
            invitedDiscordId: context.actor.userId,
            code,
            accountCreatedAt: dates.createdAt.toISOString(),
            joinedAt: dates.joinedAt.toISOString(),
          })
        ).status;
      } catch (error) {
        // "No such code" and "already referred" are answers, not faults.
        if (error instanceof ApiError && [404, 409].includes(error.status))
          throw new CommandError(`Not recorded: ${error.message}.`);
        throw error;
      }
      await privately(context, {
        content:
          status === "flagged"
            ? "Thanks. Your referral is recorded and will be checked by staff."
            : "Thanks. Your referral is recorded and will count once you've been here a little while.",
      });
    },
  },
];

// ------------------------------------------------------------- commissions

const commissionCommands: CommandDefinition[] = [
  {
    path: ["commission", "create"],
    aliases: [["commission"]],
    group: "Customers",
    authority: "member",
    cooldownMs: 15_000,
    summary: "Request a commission (website, bot, software, design…)",
    usage: "!commission create",
    run: async (context) => {
      await context.reply({
        ...say(
          "info",
          "What should KUSH build?",
          "Pick a service. Your request goes to KUSH privately, and you'll get a written quote before anything is charged.",
        ),
        components: [
          commissionServiceMenu(
            signer(context),
            context.actor.userId,
            await loadCommissionChoices(context.services.api),
          ),
        ],
      });
    },
  },
  {
    path: ["commission", "status"],
    group: "Customers",
    authority: "member",
    cooldownMs: 5_000,
    summary: "Where your commission is up to (staff: this ticket's commission)",
    usage: "!commission status [#ticket]",
    options: [
      { name: "ticket", description: "Ticket number (staff)", type: "ticket" },
    ],
    run: async (context) => {
      const { target } = targetOf(context, context.args);
      const inTicket =
        context.services.tickets.channels.has(context.channelId) ||
        target.ticket !== undefined;
      if (isStaff(context) && inTicket) {
        const found = await context.services.api.findCommission(
          context.actor.userId,
          target,
        );
        const c = found.commission;
        const quote = found.quotes[0];
        await privately(context, {
          embeds: [
            card({
              title: `Commission: ${c.title}`.slice(0, 200),
              emoji: "🛠️",
              tone: "staff",
              fields: [
                { name: "Status", value: label(c.status), inline: true },
                { name: "Service", value: c.category, inline: true },
                {
                  name: "Assigned",
                  value: c.assigneeName ?? "Nobody yet",
                  inline: true,
                },
                ...(quote
                  ? [
                      {
                        name: "Latest quote",
                        value: `${quote.amount} · ${label(quote.status)}`,
                      },
                    ]
                  : []),
                {
                  name: "Next steps",
                  value: c.actions.statuses.length
                    ? c.actions.statuses.map(label).join(", ")
                    : "None from here",
                },
              ],
            }),
          ],
        });
        return;
      }
      const mine = await context.services.api.myCommissions(
        context.actor.userId,
      );
      await privately(context, {
        embeds: [
          embed(
            "Your commissions",
            mine.length
              ? mine
                  .map(
                    (c) =>
                      `**${c.title}** · ${label(c.status)}${c.quote ? ` · quote ${c.quote}` : ""}${c.ticketNumber ? ` · ticket #${c.ticketNumber}` : ""}`,
                  )
                  .join("\n")
              : "None yet. Start one with `/commission create`.",
          ),
        ],
      });
    },
  },
  {
    path: ["commission", "quote"],
    group: "Support staff",
    authority: "staff",
    summary: "Send this commission's customer a quote",
    usage: "!commission quote <price> [#ticket] <what's included>",
    options: [
      { name: "price", description: "e.g. 120 or 120.50", required: true },
      {
        name: "summary",
        description: "What's included, revisions, timescale",
        required: true,
      },
      { name: "ticket", description: "Ticket number", type: "ticket" },
    ],
    run: async (context) => {
      const { target, rest } = targetOf(context, context.args);
      const amountPence = parsePrice(rest[0] ?? "");
      const summary = rest.slice(1).join(" ").trim();
      if (!amountPence || summary.length < 10)
        throw new CommandError(
          "Usage: `!commission quote <price> <what's included>` (at least 10 characters).",
        );
      const quoted = await context.services.api.commissionQuote(
        context.actor.userId,
        target,
        { amountPence, summary, timeframe: null, revisions: null },
      );
      await context.reply({
        content: `📨 Quote of **${quoted.amount}** sent for ticket #${quoted.ticketNumber}. The customer accepts and pays on the website; it expires in 14 days.`,
      });
    },
  },
  {
    path: ["commission", "assign"],
    group: "Support staff",
    authority: "staff",
    summary: "Assign a commission to a developer",
    usage: "!commission assign <@developer | none> [#ticket]",
    options: [
      {
        name: "developer",
        description: "Who builds it (leave empty to unassign)",
        type: "user",
      },
      { name: "ticket", description: "Ticket number", type: "ticket" },
    ],
    run: async (context) => assignCommission(context),
  },
  {
    path: ["commission", "update"],
    group: "Support staff",
    authority: "staff",
    summary: "Move a commission to its next stage",
    usage: "!commission update <stage> [#ticket]",
    options: [
      {
        name: "stage",
        description: "New stage",
        required: true,
        choices: [
          { name: "Under review", value: "reviewing" },
          { name: "Awaiting info from customer", value: "awaiting_customer" },
          { name: "In development", value: "in_progress" },
          { name: "Ready for customer review", value: "awaiting_review" },
          { name: "Cancelled", value: "cancelled" },
        ],
      },
      { name: "ticket", description: "Ticket number", type: "ticket" },
    ],
    run: async (context) => {
      const { target, rest } = targetOf(context, context.args);
      const status = rest[0]?.toLowerCase();
      if (!status)
        throw new CommandError(
          "Usage: `!commission update <reviewing|awaiting_customer|in_progress|awaiting_review|cancelled> [#ticket]`",
        );
      const moved = await context.services.api.commissionStatus(
        context.actor.userId,
        target,
        status,
      );
      await context.reply({
        content: `Commission (ticket #${moved.ticketNumber}) is now **${label(moved.status)}**. The customer has been told.`,
      });
    },
  },
  {
    path: ["commission", "complete"],
    group: "Support staff",
    authority: "staff",
    summary: "Mark a commission as delivered and complete",
    usage: "!commission complete [#ticket]",
    options: [{ name: "ticket", description: "Ticket number", type: "ticket" }],
    run: async (context) => {
      const { target } = targetOf(context, context.args);
      const moved = await context.services.api.commissionStatus(
        context.actor.userId,
        target,
        "completed",
      );
      await context.reply({
        content: `✅ Commission (ticket #${moved.ticketNumber}) is complete. Nice work.`,
      });
    },
  },
];

async function assignCommission(context: CommandContext) {
  const { target, rest } = targetOf(context, context.args);
  const who = rest.find((arg) => MENTION.test(arg) || arg === "none");
  const assignee = who && who !== "none" ? MENTION.exec(who)![1]! : null;
  const result = await context.services.api.commissionAssign(
    context.actor.userId,
    target,
    assignee,
  );
  await context.reply({
    content: result.assigned
      ? `Commission (ticket #${result.ticketNumber}) assigned to <@${assignee}>.`
      : `Commission (ticket #${result.ticketNumber}) is unassigned.`,
  });
}

// ----------------------------------------------------------------- staff

const productFields = [
  "name",
  "price",
  "description",
  "status",
  "visibility",
  "category",
  "image",
] as const;

const staffCommands: CommandDefinition[] = [
  {
    path: ["product", "create"],
    group: "Administration",
    authority: "staff",
    summary: "Add a product (starts as a draft)",
    usage: "!product create <code> <price> <name>",
    options: [
      {
        name: "code",
        description: "Short code, e.g. rust-starter",
        required: true,
      },
      { name: "price", description: "e.g. 15 or 15.50", required: true },
      { name: "name", description: "Product name", required: true },
    ],
    run: async (context) => {
      const [slug, price, ...name] = context.args;
      const pricePence = parsePrice(price ?? "");
      if (!slug || !pricePence || !name.length)
        throw new CommandError(
          "Usage: `!product create <code> <price> <name>`",
        );
      const product = await context.services.api.createProduct(
        context.actor.userId,
        {
          slug: slug.toLowerCase(),
          name: name.join(" "),
          pricePence,
          status: "draft",
        },
      );
      await privately(context, {
        content: `📦 **${product.name}** created as a draft at ${money(product.pricePence)}. Publish it with \`!product edit ${product.slug} status active\`.`,
      });
    },
  },
  {
    path: ["product", "edit"],
    group: "Administration",
    authority: "staff",
    summary: "Change a product's name, price, status or visibility",
    usage: `!product edit <code> <${productFields.join("|")}> <value>`,
    options: [
      { name: "code", description: "Product code", required: true },
      {
        name: "field",
        description: "What to change",
        required: true,
        choices: productFields.map((field) => ({ name: field, value: field })),
      },
      { name: "value", description: "New value", required: true },
    ],
    run: async (context) => {
      const [slug, field, ...value] = context.args;
      const text = value.join(" ").trim();
      if (!slug || !field || !text)
        throw new CommandError(
          `Usage: \`!product edit <code> <${productFields.join("|")}> <value>\``,
        );
      let patch: Record<string, unknown>;
      switch (field.toLowerCase()) {
        case "price": {
          const pricePence = parsePrice(text);
          if (!pricePence)
            throw new CommandError("Price must look like 15 or 15.50.");
          patch = { pricePence };
          break;
        }
        case "status":
          patch = { status: text.toLowerCase() };
          break;
        case "visibility":
          patch = { visibility: text.toLowerCase() };
          break;
        case "image":
          patch = { imageUrl: text };
          break;
        case "name":
        case "description":
        case "category":
          patch = { [field.toLowerCase()]: text };
          break;
        default:
          throw new CommandError(
            `Field must be one of: ${productFields.join(", ")}.`,
          );
      }
      const product = await context.services.api.updateProduct(
        context.actor.userId,
        slug.toLowerCase(),
        patch,
      );
      await privately(context, {
        content: `📦 **${product.name}** saved · ${money(product.pricePence)} · ${product.status}.`,
      });
    },
  },
  {
    path: ["product", "archive"],
    group: "Administration",
    authority: "staff",
    summary: "Stop selling a product (existing owners keep it)",
    usage: "!product archive <code>",
    options: [{ name: "code", description: "Product code", required: true }],
    run: async (context) => {
      const slug = context.args[0]?.toLowerCase();
      if (!slug) throw new CommandError("Usage: `!product archive <code>`");
      const product = await context.services.api.updateProduct(
        context.actor.userId,
        slug,
        { status: "retired" },
      );
      await privately(context, {
        content: `📦 **${product.name}** is no longer for sale. People who bought it keep access.`,
      });
    },
  },
  {
    path: ["staff", "orders"],
    group: "Support staff",
    authority: "staff",
    summary: "Latest orders (sent privately)",
    usage: "!staff orders",
    run: async (context) => {
      const orders = await context.services.api.staffOrders(
        context.actor.userId,
      );
      await privately(context, {
        embeds: [
          card({
            title: "Latest orders",
            emoji: "🧾",
            tone: "staff",
            description: orders.length
              ? orders.map(orderLine).join("\n")
              : "No orders yet.",
            footer: "Refunds are done on the staff website (2FA).",
          }),
        ],
      });
    },
  },
  {
    path: ["staff", "commissions"],
    group: "Support staff",
    authority: "staff",
    summary: "Commissions assigned to you, or all of them",
    usage: "!staff commissions [all]",
    options: [
      {
        name: "scope",
        description: "Whose commissions",
        choices: [
          { name: "Mine", value: "assigned" },
          { name: "Everyone's", value: "all" },
        ],
      },
    ],
    run: async (context) => {
      const scope =
        context.args[0]?.toLowerCase() === "all" ? "all" : "assigned";
      const rows = await context.services.api.staffCommissions(
        context.actor.userId,
        scope,
      );
      await privately(context, {
        embeds: [
          card({
            title: scope === "all" ? "All commissions" : "Your commissions",
            emoji: "🛠️",
            tone: "staff",
            description: rows.length
              ? rows
                  .map(
                    (c) =>
                      `${c.ticketNumber ? `#${c.ticketNumber}` : "—"} · **${c.title.slice(0, 50)}** · ${label(c.status)}${scope === "all" ? ` · ${c.assigneeName ?? "unassigned"}` : ""}`,
                  )
                  .join("\n")
              : "Nothing here.",
          }),
        ],
      });
    },
  },
  {
    path: ["staff", "assign"],
    group: "Support staff",
    authority: "staff",
    summary: "Assign a commission to a developer",
    usage: "!staff assign <@developer | none> [#ticket]",
    options: [
      {
        name: "developer",
        description: "Who builds it (leave empty to unassign)",
        type: "user",
      },
      { name: "ticket", description: "Ticket number", type: "ticket" },
    ],
    run: async (context) => assignCommission(context),
  },
  {
    path: ["staff", "customer"],
    group: "Support staff",
    authority: "staff",
    summary: "A customer's orders, commissions and credit (sent privately)",
    usage: "!staff customer <@member>",
    options: [
      {
        name: "member",
        description: "The customer",
        required: true,
        type: "user",
      },
    ],
    run: async (context) => {
      const id = MENTION.exec(context.args[0] ?? "")?.[1];
      if (!id) throw new CommandError("Usage: `!staff customer <@member>`");
      const customer = await context.services.api.staffCustomer(
        context.actor.userId,
        id,
      );
      await privately(context, {
        embeds: [
          card({
            title: customer.name,
            emoji: "👤",
            tone: "staff",
            fields: [
              {
                name: "Paid orders",
                value: String(customer.paidOrders),
                inline: true,
              },
              {
                name: "Active commissions",
                value: String(customer.activeCommissions),
                inline: true,
              },
              {
                name: "Open tickets",
                value: String(customer.openTickets),
                inline: true,
              },
              {
                name: "Qualified referrals",
                value: String(customer.qualifiedReferrals),
                inline: true,
              },
              {
                name: "Store credit",
                value: money(customer.creditPence),
                inline: true,
              },
              {
                name: "Customer since",
                value: `<t:${Math.floor(new Date(customer.since).getTime() / 1000)}:D>`,
                inline: true,
              },
            ],
          }),
        ],
      });
    },
  },
  {
    path: ["staff", "role"],
    group: "Support staff",
    authority: "staff",
    summary: "Grant or revoke a customer or partner role",
    usage: "!staff role <@member> <grant|revoke> <role> <reason>",
    options: [
      { name: "member", description: "Who", required: true, type: "user" },
      {
        name: "action",
        description: "Grant or revoke",
        required: true,
        choices: [
          { name: "Grant", value: "grant" },
          { name: "Revoke", value: "revoke" },
        ],
      },
      {
        name: "role",
        description: "Which role",
        required: true,
        choices: grantableChoices,
      },
      {
        name: "reason",
        description: "Why (kept in the audit log)",
        required: true,
      },
    ],
    run: async (context) => {
      const [who, action, roleKey, ...reason] = context.args;
      const discordUserId = MENTION.exec(who ?? "")?.[1];
      const role = grantableChoices.find((choice) => choice.value === roleKey);
      if (
        !discordUserId ||
        (action !== "grant" && action !== "revoke") ||
        !role ||
        reason.join(" ").trim().length < 3
      )
        throw new CommandError(
          `Use it like this: \`!staff role @member grant beta-tester Joined the beta\`. Roles: ${grantableChoices.map((choice) => `\`${choice.value}\``).join(", ")}.`,
          "How to use it",
        );
      const result = await context.services.api.setStaffRole({
        actorDiscordId: context.actor.userId,
        discordUserId,
        roleKey: role.value,
        action,
        reason: reason.join(" ").trim().slice(0, 300),
        // One record per message or interaction, so a retry can't double up.
        requestId: requestUuid(
          context.invocationId ?? `${context.actor.userId}:${Date.now()}`,
        ),
      });
      await context.reply(
        say(
          "success",
          `${role.name}: ${result.state === "granted" ? "granted" : "revoked"}`,
          `For <@${discordUserId}>. Discord updates within a minute; it's also shown on their customer page on the staff website.`,
        ),
      );
    },
  },
  {
    path: ["staff", "stats"],
    group: "Support staff",
    authority: "staff",
    cooldownMs: 10_000,
    summary: "Business numbers (sent privately)",
    usage: "!staff stats",
    run: async (context) => {
      const stats = await context.services.api.staffStats(context.actor.userId);
      await privately(context, {
        embeds: [
          card({
            title: "KUSH at a glance",
            emoji: "📊",
            tone: "staff",
            fields: [
              {
                name: "Revenue (net)",
                value: money(stats.revenuePence),
                inline: true,
              },
              {
                name: "Paid orders",
                value: String(stats.orders),
                inline: true,
              },
              {
                name: "Refunded",
                value: money(stats.refundsPence),
                inline: true,
              },
              {
                name: "Active commissions",
                value: String(stats.activeCommissions),
                inline: true,
              },
              {
                name: "Open quotes",
                value: String(stats.openQuotes),
                inline: true,
              },
              {
                name: "Open tickets",
                value: String(stats.openTickets),
                inline: true,
              },
              {
                name: "Customers",
                value: String(stats.customers),
                inline: true,
              },
              {
                name: "Referrals",
                value: `${stats.qualifiedReferrals} qualified · ${stats.flaggedReferrals} to review`,
                inline: true,
              },
              {
                name: "Credit spent",
                value: money(stats.creditSpentPence),
                inline: true,
              },
            ],
            footer:
              "Real records only. Revenue is cash received, net of refunds.",
          }),
        ],
      });
    },
  },
];

export const commerceCommands: CommandDefinition[] = [
  ...customerCommands,
  ...referralCommands,
  ...commissionCommands,
  ...staffCommands,
];
