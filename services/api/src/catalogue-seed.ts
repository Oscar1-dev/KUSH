/**
 * The starting KUSH catalogue, inserted once for a tenant with no services.
 * After that the database is the source of truth: staff edit prices and
 * copy from the website or Discord. Prices are provisional "from" estimates,
 * never fixed quotes, and no delivery time is promised before a scope check.
 */
import type { CatalogueBody } from "./catalogue.js";

type SeedOffer = {
  kind?: "tier" | "addon";
  tier?: "starter" | "standard" | "premium";
  name: string;
  description?: string;
  pricing: "fixed" | "from" | "range" | "quote";
  amount?: number;
  max?: number;
  includes?: string[];
};
export interface SeedService {
  slug: string;
  category:
    | "websites"
    | "web-apps"
    | "discord"
    | "software"
    | "gaming"
    | "technical"
    | "creative"
    | "automation";
  name: string;
  summary: string;
  fulfilment?: "in_house" | "partner_dependent" | "quote_only";
  body: CatalogueBody;
  offers: SeedOffer[];
}

const pounds = (value: number) => value * 100;
const addon = (name: string, amount?: number): SeedOffer =>
  amount === undefined
    ? { kind: "addon", name, pricing: "quote" }
    : { kind: "addon", name, pricing: "from", amount: pounds(amount) };

export const catalogueSeed: SeedService[] = [
  {
    slug: "websites",
    category: "websites",
    name: "Websites & Portfolios",
    summary:
      "Personal, portfolio and business websites, landing pages and redesigns.",
    body: {
      headline: ["Sites that", "do the work."],
      intro:
        "Custom websites with personality, built properly underneath: fast on a phone, easy to update, and made for your audience instead of a template's.",
      offerings: [
        {
          title: "Personal & portfolio sites",
          text: "A home for you and your work that looks as good as the work itself.",
        },
        {
          title: "Business websites",
          text: "Clear pages that explain what you do and get people in touch.",
        },
        {
          title: "Landing pages",
          text: "One focused page for a launch, a product or a campaign.",
        },
        {
          title: "Redesigns & maintenance",
          text: "Refresh, speed up or look after a site you already have.",
        },
        {
          title: "E-commerce",
          text: "Online shops with product pages and checkout, quoted per project.",
        },
      ],
      deliverables: [
        "The finished site, live or ready to go live",
        "Source code you own",
        "A short guide to updating it",
        "Support after launch",
      ],
      goodFit: [
        "You need a site that doesn't look like everyone else's",
        "You want a portfolio that sells your work",
        "Your current site is slow, broken or dated",
      ],
      availability: {
        now: [
          "Design and build",
          "Responsive layouts",
          "Contact forms",
          "Basic SEO",
          "Redesigns and maintenance",
        ],
        partner: [
          "Domain names and hosting (billed by the provider)",
          "Business email (billed by the provider)",
          "Payment processing for shops (needs your own Stripe or PayPal account)",
        ],
      },
      faqs: [
        {
          q: "Do I need hosting and a domain already?",
          a: "No. We can recommend options and set them up with you. They're paid to the provider directly, not to KUSH.",
        },
        {
          q: "Can I edit the site myself afterwards?",
          a: "Yes, if you want to. We'll agree up front how content gets updated and show you how.",
        },
        {
          q: "How long does it take?",
          a: "It depends on the scope, so you'll get a timeline with your quote instead of a guess here.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Portfolio website",
        pricing: "from",
        amount: pounds(40),
        description: "A focused one- or two-page site for you or your work.",
        includes: [
          "Custom design, not a theme",
          "Mobile-first",
          "Contact links or form",
        ],
      },
      {
        tier: "standard",
        name: "Business website",
        pricing: "from",
        amount: pounds(80),
        description: "A small multi-page site for a business.",
        includes: [
          "Up to five pages",
          "Contact form",
          "Basic SEO setup",
          "Google Maps and socials",
        ],
      },
      {
        tier: "premium",
        name: "Advanced website project",
        pricing: "range",
        amount: pounds(300),
        max: pounds(700),
        description:
          "A complete, art-directed site. Larger builds are quoted individually.",
        includes: [
          "Several pages and sections",
          "Motion and interactions",
          "Editable content",
          "Accessibility and speed pass",
        ],
      },
      addon("Quick fix or small change", 10),
      addon("Extra pages"),
      addon("Online shop / e-commerce"),
      addon("Ongoing maintenance"),
    ],
  },
  {
    slug: "web-apps",
    category: "web-apps",
    name: "Web Apps & Dashboards",
    summary:
      "Custom web applications, customer dashboards, admin panels and API integrations.",
    body: {
      headline: ["Your data,", "under control."],
      intro:
        "Web applications people sign in to: dashboards, admin panels, client portals and internal tools, with proper accounts, permissions and the boring-but-vital security work done right.",
      offerings: [
        {
          title: "Customer dashboards",
          text: "Give your customers their own signed-in space.",
        },
        {
          title: "Admin panels",
          text: "Manage users, orders, content or bookings without touching a database.",
        },
        {
          title: "Internal tools",
          text: "Swap a messy spreadsheet for something your team can actually use.",
        },
        {
          title: "API integrations",
          text: "Connect your app to the services you already use.",
        },
      ],
      deliverables: [
        "The working app",
        "Source code you own",
        "Technical documentation",
        "Handover session",
      ],
      goodFit: [
        "Your team lives in spreadsheets",
        "Customers keep asking for an account area",
        "You need a dashboard for data you already have",
      ],
      availability: {
        now: [
          "Accounts, roles and 2FA",
          "Databases and APIs",
          "Dashboards and admin panels",
          "Discord-connected features",
        ],
        partner: [
          "Taking payments (needs your own Stripe or PayPal account)",
          "Server hosting (billed by the provider)",
          "Native mobile apps",
        ],
      },
      faqs: [
        {
          q: "Can it connect to tools I already use?",
          a: "Usually. Tell us which ones and we'll check what their APIs allow before quoting.",
        },
        {
          q: "Is it secure?",
          a: "Sign-in, permissions and audit logs are built in from the start, the same way the KUSH platform works.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Small feature or fix",
        pricing: "from",
        amount: pounds(40),
        includes: [
          "A new page, chart or form",
          "Bug fixes",
          "Testing before hand-over",
        ],
      },
      {
        tier: "standard",
        name: "Custom web application",
        pricing: "from",
        amount: pounds(150),
        includes: [
          "Sign-in and roles",
          "Database and API",
          "Responsive interface",
          "Deployment help",
        ],
      },
      {
        tier: "premium",
        name: "Full platform",
        pricing: "quote",
        includes: [
          "Scoping session",
          "Accounts, 2FA and audit logs",
          "Integrations",
          "Milestone delivery",
        ],
      },
      addon("Two-factor authentication"),
      addon("Exports and reports"),
      addon("Discord integration"),
    ],
  },
  {
    slug: "discord",
    category: "discord",
    name: "Discord Bots & Servers",
    summary:
      "Custom bots, moderation, tickets, verification, economy systems and server setup.",
    body: {
      headline: ["Your server,", "fully loaded."],
      intro:
        "Discord servers that run themselves. Clean channel and role setups, plus custom bots for tickets, moderation, verification and more. Our own server runs on a bot we built, so you can try the ideas first.",
      offerings: [
        {
          title: "Server setup",
          text: "Channels, roles and permissions organised properly, with locked info channels.",
        },
        {
          title: "Ticket & moderation bots",
          text: "Private tickets, claims, transcripts, warnings, timeouts and case logs.",
        },
        {
          title: "Verification & economy",
          text: "Verification flows, levels, currencies and custom commands.",
        },
        {
          title: "Website integrations",
          text: "Link your server to a website or store, so roles follow purchases.",
        },
      ],
      deliverables: [
        "Your bot, running in your server",
        "Source code you own",
        "A setup guide for your staff",
        "Support after launch",
      ],
      goodFit: [
        "Your support is lost in DMs and general chat",
        "Your mods need better tools",
        "You want Discord roles tied to your website or store",
      ],
      availability: {
        now: [
          "Server design and permissions",
          "Custom bots and commands",
          "Tickets, moderation, verification and economy",
          "Website and role sync",
        ],
        partner: ["24/7 bot hosting (billed by the host)"],
      },
      faqs: [
        {
          q: "Where will the bot run?",
          a: "On hosting you choose, and we'll help you set it up. The host bills you directly.",
        },
        {
          q: "Can I see an example?",
          a: "Yes. Join the KUSH Discord: tickets, moderation, vouches and staff applications all run on our own bot.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Discord server setup",
        pricing: "from",
        amount: pounds(15),
        includes: [
          "Channels and categories",
          "Roles and permissions",
          "Read-only info channels",
        ],
      },
      {
        tier: "standard",
        name: "Basic Discord bot",
        pricing: "from",
        amount: pounds(25),
        includes: [
          "Custom commands",
          "Embeds styled to your brand",
          "Setup help",
        ],
      },
      {
        tier: "premium",
        name: "Advanced bot system",
        pricing: "quote",
        includes: [
          "Tickets, moderation or economy",
          "Website and role sync",
          "Staff dashboard",
          "Milestone delivery",
        ],
      },
      addon("Ticket transcripts"),
      addon("Verification flow"),
      addon("Economy system"),
    ],
  },
  {
    slug: "software",
    category: "software",
    name: "Desktop Software & Tools",
    summary:
      "Custom desktop applications, Windows utilities, business tools and improvements to existing software.",
    body: {
      headline: ["Software", "with substance."],
      intro:
        "Desktop apps and tools that feel at home on the machine they run on, from a small utility that saves you an hour a day to a full application.",
      offerings: [
        {
          title: "Windows utilities",
          text: "Automate the repetitive thing you do every day.",
        },
        {
          title: "Custom desktop apps",
          text: "Proper applications with a real interface, built around one job.",
        },
        {
          title: "Business tools",
          text: "Replace the fragile script someone wrote three years ago.",
        },
        {
          title: "Improvements",
          text: "Fix, extend or modernise software you already have.",
        },
      ],
      deliverables: [
        "Builds ready to run",
        "Installer",
        "User guide",
        "Source code",
      ],
      goodFit: [
        "You repeat the same steps every day",
        "Your users live on the desktop",
        "Existing software needs fixing or extending",
      ],
      availability: {
        now: [
          "Windows tools and utilities",
          "Cross-platform desktop apps",
          "API development",
        ],
        partner: [
          "Code-signing certificates (bought from a certificate provider)",
          "App-store publishing (needs your developer account)",
        ],
      },
      faqs: [
        {
          q: "Will it work on Mac and Linux?",
          a: "Many tools can be cross-platform. Some things are Windows-only, and we'll say which in your quote.",
        },
        {
          q: "Why does Windows warn about an unknown publisher?",
          a: "Unsigned software triggers that warning. A code-signing certificate removes it, but it's bought from a provider.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Windows utility or script",
        pricing: "from",
        amount: pounds(20),
        includes: ["One task, automated", "Instructions to run it"],
      },
      {
        tier: "standard",
        name: "Custom desktop software",
        pricing: "from",
        amount: pounds(100),
        includes: ["Proper interface", "Settings and saved data", "Installer"],
      },
      {
        tier: "premium",
        name: "Bespoke application",
        pricing: "quote",
        includes: ["Auto-updates", "Licensing", "Milestone delivery"],
      },
      addon("Auto-updates"),
      addon("Licence keys"),
    ],
  },
  {
    slug: "gaming",
    category: "gaming",
    name: "Gaming & Rust Servers",
    summary:
      "Rust server configuration, plugins and maps, plus community websites and admin tools.",
    body: {
      headline: ["Game on,", "properly."],
      intro:
        "Everything a game community needs behind the scenes: Rust server configuration, custom plugins and maps, community websites, Discord systems and the admin tools that keep it all running.",
      offerings: [
        {
          title: "Rust server configuration",
          text: "Rates, kits, loot tables and permissions set up the way you want.",
        },
        {
          title: "Rust plugins",
          text: "Custom plugins and changes to existing ones.",
        },
        {
          title: "Rust maps",
          text: "Custom maps and monuments for your server.",
        },
        {
          title: "Community websites & tools",
          text: "Sites, Discord systems and admin tools for your community.",
        },
      ],
      deliverables: [
        "Config or plugin files",
        "Install notes",
        "Source for custom work",
        "Support after launch",
      ],
      goodFit: [
        "You're launching or relaunching a server",
        "You need a plugin that doesn't exist yet",
        "Your community needs a website or better tools",
      ],
      availability: {
        now: [
          "Rust server configuration",
          "Rust plugin development",
          "Rust map creation",
          "Community websites and Discord systems",
        ],
        partner: ["Game server hosting (billed by the host)"],
      },
      faqs: [
        {
          q: "Do you host the server?",
          a: "No. You keep your own host; we configure and build for it.",
        },
        {
          q: "Will plugins break on Rust updates?",
          a: "Monthly game updates can affect plugins. Fixes after updates can be quoted per change or as an ongoing plan.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Rust server configuration",
        pricing: "from",
        amount: pounds(20),
        includes: ["Rates, kits and permissions", "Install notes"],
      },
      {
        tier: "standard",
        name: "Rust plugin development",
        pricing: "from",
        amount: pounds(25),
        includes: ["Custom plugin", "Config file", "One round of changes"],
      },
      {
        tier: "premium",
        name: "Rust map creation",
        pricing: "from",
        amount: pounds(40),
        includes: ["Custom map", "Monument placement", "Map file"],
      },
      addon("Game community website"),
      addon("Gaming Discord system"),
      addon("Server admin tools"),
    ],
  },
  {
    slug: "technical",
    category: "technical",
    name: "Technical Support & Setup",
    summary:
      "Windows troubleshooting, domains and DNS, software setup and system integration.",
    body: {
      headline: ["Fixed,", "not fiddled with."],
      intro:
        "Practical technical help: sorting out a misbehaving Windows PC, pointing a domain at the right place, installing and configuring software, or getting systems to work together.",
      offerings: [
        {
          title: "Windows troubleshooting",
          text: "Slow machines, errors, broken updates and odd behaviour.",
        },
        {
          title: "Domains & DNS",
          text: "Connect a domain to your website and email, the right way.",
        },
        {
          title: "Software setup",
          text: "Installation and configuration, done once and done properly.",
        },
        {
          title: "System integration",
          text: "Get your tools and services talking to each other.",
        },
      ],
      deliverables: [
        "The fix or setup",
        "A short note of what was done",
        "Follow-up if it comes back",
      ],
      goodFit: [
        "Something stopped working and you don't know why",
        "You've bought a domain and it isn't connected",
        "You want software set up without the headache",
      ],
      availability: {
        now: [
          "Remote Windows troubleshooting",
          "Domain and DNS configuration",
          "Software installation and configuration",
        ],
        partner: [
          "Hardware repairs (needs a local repair shop)",
          "Domain purchases (billed by the registrar)",
        ],
      },
      faqs: [
        {
          q: "Is it remote?",
          a: "Yes. Most jobs are done remotely with your permission, using a screen-sharing tool you control.",
        },
        {
          q: "What if it can't be fixed?",
          a: "We'll tell you honestly, and explain what we found.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Small technical task",
        pricing: "from",
        amount: pounds(10),
        includes: ["One problem or setup", "Done remotely"],
      },
      {
        tier: "standard",
        name: "Windows troubleshooting & support",
        pricing: "from",
        amount: pounds(10),
        includes: [
          "Diagnosis",
          "Fix where possible",
          "Summary of what changed",
        ],
      },
      {
        tier: "premium",
        name: "Domains, DNS & system integration",
        pricing: "quote",
        includes: ["Domain and DNS setup", "Email records", "Integration work"],
      },
    ],
  },
  {
    slug: "creative",
    category: "creative",
    name: "Design & Creative",
    summary:
      "UI/UX and website design, graphics and branding, motion graphics, video editing and VFX.",
    body: {
      headline: ["Look", "different."],
      intro:
        "Visual work with a point of view: interface and website design, graphics and branding, and video work, art-directed so it feels like one brand. Some motion and VFX work involves partners and is quote-only.",
      offerings: [
        {
          title: "UI/UX & website design",
          text: "Screens and flows for apps and sites, with every state designed.",
        },
        {
          title: "Graphics & branding",
          text: "Logos, banners, brand kits and Discord art.",
        },
        {
          title: "Video editing & GFX",
          text: "Edits, thumbnails and graphics for your content.",
        },
        {
          title: "Motion graphics & VFX",
          text: "Animated logos, promos and effects, quoted per project.",
        },
      ],
      deliverables: [
        "Master artwork files",
        "Exports for every platform",
        "Usage rights as agreed",
      ],
      goodFit: [
        "You're launching something new",
        "Your brand looks different everywhere",
        "Your content needs a sharper edit",
      ],
      availability: {
        now: [
          "UI/UX and website design",
          "Graphics, logos and banners",
          "Video editing and GFX",
        ],
        partner: [
          "Advanced motion graphics and VFX (quote-only, may involve a partner)",
          "Promotional video shoots",
          "Print production (billed by the printer)",
        ],
      },
      faqs: [
        {
          q: "Do I own the designs?",
          a: "Usage rights are written into your quote before you accept it.",
        },
        {
          q: "How many revisions do I get?",
          a: "Each quote states the number of revision rounds. More can be added.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Video editing or GFX",
        pricing: "from",
        amount: pounds(15),
        includes: ["One edit or graphic", "Exports for the platform"],
      },
      {
        tier: "standard",
        name: "UI/UX design",
        pricing: "from",
        amount: pounds(20),
        includes: ["Screens or flow", "Design files"],
      },
      {
        tier: "premium",
        name: "Branding, motion graphics & VFX",
        pricing: "quote",
        includes: [
          "Brand identity or motion work",
          "Guidelines or project files",
        ],
      },
      addon("Logo"),
      addon("Promotional media"),
    ],
  },
  {
    slug: "automation",
    category: "automation",
    name: "Automation & APIs",
    summary:
      "Automation software, API development and integrations that remove the busywork.",
    body: {
      headline: ["Let the", "machines do it."],
      intro:
        "Integrations and automation that take boring jobs off your plate: tools talking to each other, scheduled jobs that just run, and alerts when something needs a person.",
      offerings: [
        {
          title: "Integrations",
          text: "Get your tools sharing data automatically.",
        },
        {
          title: "Webhooks & alerts",
          text: "Get told in Discord or by email when something important happens.",
        },
        {
          title: "Scheduled jobs",
          text: "Reports, clean-ups and syncs that run on time.",
        },
        {
          title: "APIs & back-ends",
          text: "A proper back-end for your app, site or bot.",
        },
      ],
      deliverables: [
        "Working automation",
        "Source code you own",
        "Technical docs",
      ],
      goodFit: [
        "You copy data between tools by hand",
        "Things break and nobody notices",
        "You need a back-end for your app or bot",
      ],
      availability: {
        now: [
          "APIs and webhooks",
          "Scheduled jobs",
          "Discord and email alerts",
        ],
        partner: [
          "Paid third-party APIs (billed by the provider)",
          "Server hosting (billed by the provider)",
        ],
      },
      faqs: [
        {
          q: "What if my tool has no API?",
          a: "Then we'll tell you honestly what's possible.",
        },
      ],
    },
    offers: [
      {
        tier: "starter",
        name: "Small automation",
        pricing: "from",
        amount: pounds(15),
        includes: ["One trigger, one action"],
      },
      {
        tier: "standard",
        name: "API integration",
        pricing: "quote",
        includes: ["Two tools kept in sync", "Retries and alerts"],
      },
      {
        tier: "premium",
        name: "Automated workflows & back-ends",
        pricing: "quote",
        includes: ["Custom API or service", "Monitoring", "Milestone delivery"],
      },
    ],
  },
];
