/**
 * Public website copy and the service catalogue. Describes what KUSH
 * actually offers and how the real commission pipeline runs. No invented
 * clients, stats or reviews: vouches only come from the live vouch system,
 * and showcase images are labelled concepts.
 *
 * Prices are indicative starting points ("from"), never fixed quotes. Every
 * project gets a scope check and a written quote first, and no delivery
 * time is promised before that.
 */

export type TierKey = "starter" | "standard" | "premium";

export interface Tier {
  key: TierKey;
  name: string;
  /** Indicative starting price, or null when it's always quoted. */
  from: string | null;
  /** Extra price note (e.g. a typical range), or the label when there's no price. */
  quote?: string;
  forWhat: string;
  includes: string[];
}

export interface Service {
  slug: string;
  index: string;
  name: string;
  /** One line for cards and menus. */
  summary: string;
  headline: [string, string];
  intro: string;
  offerings: { title: string; text: string }[];
  tiers: Tier[];
  /** Add-ons that can be quoted onto any tier. */
  options: string[];
  deliverables: string[];
  goodFit: string[];
  /** What we deliver ourselves today vs. what relies on a third party. */
  availability: { now: string[]; partner: string[] };
  faqs: { q: string; a: string }[];
}

export const services: Service[] = [
  {
    slug: "websites",
    index: "01",
    name: "Websites & Portfolios",
    summary: "Custom websites and portfolios, from a quick fix to a fully art-directed site.",
    headline: ["Sites that", "do the work."],
    intro:
      "Custom websites and portfolios with personality, built properly underneath: fast on a phone, easy to update, and made for your audience instead of a template's.",
    offerings: [
      { title: "Portfolios", text: "A home for your work that looks as good as the work itself." },
      { title: "Business & brand sites", text: "Clear pages that explain what you do and get people in touch." },
      { title: "Landing pages", text: "One focused page for a launch, a product or a campaign." },
      { title: "Fixes & refreshes", text: "Tidy up, speed up or restyle a site you already have." },
    ],
    tiers: [
      { key: "starter", name: "Quick job", from: "£10", forWhat: "Small changes to a site you already have.", includes: ["Text, image or link updates", "Small layout or styling fixes", "One round of tweaks"] },
      { key: "standard", name: "One-page or portfolio", from: "£150", forWhat: "A focused site that's fully yours.", includes: ["Custom design, not a theme", "Mobile-first and fast", "Contact form or links", "Basic SEO setup"] },
      { key: "premium", name: "Full custom website", from: "£300", quote: "Usually £300–£700+", forWhat: "A complete, art-directed multi-page site.", includes: ["Several pages and sections", "Motion and interactions", "Editable content", "Accessibility and speed pass"] },
    ],
    options: ["Extra pages", "Blog or news section", "Booking or enquiry forms", "Animations and motion", "Copywriting help", "Ongoing updates"],
    deliverables: ["The finished site, live or ready to go live", "Source code you own", "A short guide to updating it", "Support after launch"],
    goodFit: ["You need a site that doesn't look like everyone else's", "You want a portfolio that sells your work", "Your current site is slow, broken or dated"],
    availability: {
      now: ["Design and build", "Responsive layouts", "Contact forms", "Basic SEO"],
      partner: ["Domain names and hosting (billed by the provider)", "Business email (billed by the provider)", "Professional photography"],
    },
    faqs: [
      { q: "Do I need hosting and a domain already?", a: "No. We can recommend options and set them up with you. They're paid to the provider directly, not to KUSH." },
      { q: "Can I edit the site myself afterwards?", a: "Yes, if you want to. We'll agree up front how content gets updated and show you how." },
      { q: "How long does it take?", a: "It depends on the scope, so you'll get a timeline with your quote instead of a guess here." },
    ],
  },
  {
    slug: "web-apps",
    index: "02",
    name: "Web Apps & Dashboards",
    summary: "Dashboards, admin panels and web apps with accounts, roles and real data.",
    headline: ["Your data,", "under control."],
    intro:
      "Web applications people sign in to: dashboards, admin panels, client portals and internal tools, with proper accounts, permissions and the boring-but-vital security work done right.",
    offerings: [
      { title: "Dashboards", text: "Your numbers and records in one clear place, updated live." },
      { title: "Admin panels", text: "Manage users, orders, content or bookings without touching a database." },
      { title: "Client portals", text: "Give your customers their own signed-in space, like a KUSH account." },
      { title: "Internal tools", text: "Swap a messy spreadsheet for something your team can actually use." },
    ],
    tiers: [
      { key: "starter", name: "Small feature", from: "£40", forWhat: "One addition to an app you already run.", includes: ["A new page, chart or form", "Bug fixes", "Testing before hand-over"] },
      { key: "standard", name: "Dashboard or internal tool", from: "£350", forWhat: "A focused app built around one job.", includes: ["Sign-in and roles", "Database and API", "Responsive interface", "Deployment help"] },
      { key: "premium", name: "Full web application", from: null, quote: "Quoted individually", forWhat: "A complete product with several moving parts.", includes: ["Scoping session", "Accounts, 2FA and audit logs", "Integrations", "Milestone delivery"] },
    ],
    options: ["Two-factor authentication", "Email notifications", "Exports and reports", "Discord integration", "Payment-ready flows", "Maintenance plan"],
    deliverables: ["The working app", "Source code you own", "Technical documentation", "Handover session"],
    goodFit: ["Your team lives in spreadsheets", "Customers keep asking for an account area", "You need a dashboard for data you already have"],
    availability: {
      now: ["Accounts, roles and 2FA", "Databases and APIs", "Dashboards and admin panels", "Discord-connected features"],
      partner: ["Taking payments (needs your own Stripe or PayPal account)", "Server hosting (billed by the provider)", "Native mobile apps"],
    },
    faqs: [
      { q: "Can it connect to tools I already use?", a: "Usually, yes. Tell us which ones in your request and we'll check what their APIs allow before quoting." },
      { q: "Is it secure?", a: "Sign-in, permissions and audit logs are built in from the start, the same way the KUSH platform itself works." },
      { q: "Who hosts it?", a: "You can host it yourself or with a provider you choose. Hosting is billed by that provider, not by KUSH." },
    ],
  },
  {
    slug: "software",
    index: "03",
    name: "Desktop Software & Tools",
    summary: "Custom desktop apps, utilities and scripts that save you hours.",
    headline: ["Software", "with substance."],
    intro:
      "Desktop apps and tools that feel at home on the machine they run on, from a small script that saves you an hour a day to a full application with installers and updates.",
    offerings: [
      { title: "Utilities & scripts", text: "Automate the repetitive thing you do every single day." },
      { title: "Desktop apps", text: "Proper applications with a real interface, built around one job." },
      { title: "Licensing & updates", text: "Licence keys, protected downloads and update channels." },
      { title: "Internal tools", text: "Replace the fragile script someone wrote three years ago." },
    ],
    tiers: [
      { key: "starter", name: "Script or small utility", from: "£20", forWhat: "One task, automated.", includes: ["Command-line or simple UI", "Instructions to run it", "One round of changes"] },
      { key: "standard", name: "Custom desktop tool", from: "£150", forWhat: "A focused app with a proper interface.", includes: ["Windows-first or cross-platform", "Settings and saved data", "Installer"] },
      { key: "premium", name: "Full desktop application", from: null, quote: "Quoted individually", forWhat: "A complete product, ready to ship to users.", includes: ["Auto-updates", "Licence keys", "Crash reporting", "Milestone delivery"] },
    ],
    options: ["Auto-updates", "Licence keys", "Cloud sync", "Discord integration", "Installer branding", "Maintenance plan"],
    deliverables: ["Builds ready to run", "Installer and update path", "User guide", "Source code"],
    goodFit: ["You repeat the same steps every day", "Your users live on the desktop", "You want to sell or license software"],
    availability: {
      now: ["Windows tools and scripts", "Cross-platform desktop apps", "Licence keys and protected downloads"],
      partner: ["Code-signing certificates (bought from a certificate provider)", "App-store publishing (needs your developer account)", "macOS notarisation"],
    },
    faqs: [
      { q: "Will it work on Mac and Linux?", a: "Many tools can be cross-platform. Some things are Windows-only, and we'll say which in your quote." },
      { q: "Why does Windows warn about an unknown publisher?", a: "Unsigned software triggers that warning. A code-signing certificate removes it, but it's bought from a provider, so we list it separately." },
      { q: "Can you update it later?", a: "Yes. Updates and fixes can be quoted per change or as an ongoing plan." },
    ],
  },
  {
    slug: "discord",
    index: "04",
    name: "Discord Bots & Servers",
    summary: "Server setups and custom bots: tickets, moderation, roles, onboarding and more.",
    headline: ["Your server,", "fully loaded."],
    intro:
      "Discord servers that run themselves. Clean channel and role setups, plus custom bots for tickets, moderation, onboarding and role sync. Our own server runs on a bot we built, so you can try the ideas before you commission anything.",
    offerings: [
      { title: "Server setup", text: "Channels, roles and permissions organised properly, with locked info channels." },
      { title: "Ticket systems", text: "Private ticket channels with categories, claims, transcripts and a staff queue." },
      { title: "Moderation", text: "Warnings, timeouts, numbered cases and rule-break reports sent to your mods." },
      { title: "Website & role sync", text: "Link your server to a website or store, so roles follow purchases." },
    ],
    tiers: [
      { key: "starter", name: "Server setup", from: "£10", forWhat: "A tidy, secure server layout.", includes: ["Channels and categories", "Roles and permissions", "Read-only info channels"] },
      { key: "standard", name: "Custom bot", from: "£60", forWhat: "A bot built around what your server needs.", includes: ["Commands and buttons", "Tickets or moderation", "Embeds styled to your brand", "Setup help"] },
      { key: "premium", name: "Integrated bot system", from: "£250", quote: "Quoted individually", forWhat: "Bots connected to your website, store or API.", includes: ["Website and account sync", "Role sync from purchases", "Staff dashboard", "Milestone delivery"] },
    ],
    options: ["Ticket transcripts", "Verification and onboarding", "Rule-break detection", "Vouch or review system", "Web dashboard", "Hosting setup"],
    deliverables: ["Your bot, running in your server", "Source code you own", "A setup guide for your staff", "Support after launch"],
    goodFit: ["Your support is lost in DMs and general chat", "Your mods need better tools", "You want Discord roles tied to your website or store"],
    availability: {
      now: ["Server design and permissions", "Custom bots and commands", "Tickets, moderation and vouches", "Website and role sync"],
      partner: ["24/7 bot hosting (billed by the host)", "Discord bot verification (applied for through Discord)"],
    },
    faqs: [
      { q: "Where will the bot run?", a: "On hosting you choose, and we'll help you set it up. The host bills you directly, not KUSH." },
      { q: "Can I see an example?", a: "Yes. Join the KUSH Discord: tickets, moderation, vouches and staff applications all run on our own bot." },
      { q: "Will it work with the bots I already have?", a: "Usually. Tell us what you run now and we'll plan around it." },
    ],
  },
  {
    slug: "creative",
    index: "05",
    name: "UI/UX, Graphics & Creative",
    summary: "Logos, banners, brand kits and interface design that actually stand out.",
    headline: ["Look", "different."],
    intro:
      "Visual work with a point of view: logos, banners and Discord art, full brand identities, and interface design for apps and sites, all art-directed so it feels like one brand.",
    offerings: [
      { title: "Graphics", text: "Banners, icons, emoji and social posts, exported for where they'll live." },
      { title: "Logos & brand kits", text: "A mark, colours and type, plus the rules that hold them together." },
      { title: "UI/UX design", text: "Screens and flows for apps and sites, with every state designed." },
      { title: "Community branding", text: "Discord server art, banners and panels that match your brand." },
    ],
    tiers: [
      { key: "starter", name: "Single graphic", from: "£10", forWhat: "One banner, icon or post.", includes: ["One design", "Exports for the platform", "One round of changes"] },
      { key: "standard", name: "Logo or server branding pack", from: "£40", forWhat: "A small, consistent set.", includes: ["Logo or server art set", "Colour palette", "Source files"] },
      { key: "premium", name: "Brand identity or full UI design", from: "£150", quote: "Quoted individually", forWhat: "A complete visual system or app design.", includes: ["Identity system or UI screens", "Brand or design guidelines", "Developer-ready files"] },
    ],
    options: ["Animated versions", "Extra formats and sizes", "Social media templates", "Clickable prototype", "Brand guidelines", "Print-ready files"],
    deliverables: ["Master artwork files", "Exports for every platform", "Usage rights as agreed", "Guidelines where included"],
    goodFit: ["You're launching something new", "Your brand looks different everywhere it appears", "Your app works but looks unfinished"],
    availability: {
      now: ["Logos, banners and graphics", "Brand kits", "UI/UX design and prototypes", "Discord server art"],
      partner: ["Print production (billed by the printer)", "Live-action video and photography", "Trademark registration (through a solicitor)"],
    },
    faqs: [
      { q: "Do I own the designs?", a: "Usage rights are written into your quote before you accept it, so you know exactly what you get." },
      { q: "How many revisions do I get?", a: "Each tier includes a set number of rounds, stated in your quote. More can be added." },
      { q: "Can you match my existing brand?", a: "Yes. Send what you have (logo, colours, fonts) with your request and we'll build on it." },
    ],
  },
  {
    slug: "automation",
    index: "06",
    name: "Automation & API Integrations",
    summary: "Connect your tools, automate the busywork and stop copying data between tabs.",
    headline: ["Let the", "machines do it."],
    intro:
      "Integrations and automation that take boring jobs off your plate: tools talking to each other, scheduled jobs that just run, and webhooks that fire when something happens, with failures reported instead of lost.",
    offerings: [
      { title: "Integrations", text: "Get two (or ten) of your tools sharing data automatically." },
      { title: "Webhooks & alerts", text: "Get told in Discord or by email when something important happens." },
      { title: "Scheduled jobs", text: "Reports, clean-ups and syncs that run on time, every time." },
      { title: "APIs & back-ends", text: "A proper back-end for your app, site or bot, with logs and audit trails." },
    ],
    tiers: [
      { key: "starter", name: "Small automation", from: "£15", forWhat: "One trigger, one action.", includes: ["Webhook or scheduled job", "Setup instructions", "One round of changes"] },
      { key: "standard", name: "Integration", from: "£80", forWhat: "Two tools kept in sync.", includes: ["API connection both ways", "Retries on failure", "Error alerts"] },
      { key: "premium", name: "Automated workflows & back-ends", from: null, quote: "Quoted individually", forWhat: "Several systems working as one.", includes: ["Custom API or service", "Queues and audit logs", "Monitoring", "Milestone delivery"] },
    ],
    options: ["Discord or email alerts", "Dashboards", "Scheduled reports", "Data clean-up", "Monitoring", "Maintenance plan"],
    deliverables: ["Working automation", "Source code you own", "Technical docs", "Handover"],
    goodFit: ["You copy data between tools by hand", "Things break and nobody notices", "You need a back-end for your app or bot"],
    availability: {
      now: ["APIs and webhooks", "Scheduled jobs", "Discord and email alerts", "Back-end services"],
      partner: ["Paid third-party APIs (billed by the provider)", "Server hosting (billed by the provider)"],
    },
    faqs: [
      { q: "What if my tool has no API?", a: "Then we'll tell you honestly what's possible. Some tools only allow exports, or no automation at all." },
      { q: "What happens when something fails?", a: "Our automations retry, and alert you when something needs a person, instead of failing quietly." },
      { q: "Are there running costs?", a: "Sometimes: hosting or a paid API plan. We'll list any in your quote, and they're billed by the provider." },
    ],
  },
];

export const serviceBySlug = (slug: string) => services.find((service) => service.slug === slug);

/** Lowest "from" price across a service's tiers, for cards. */
export const startingPrice = (service: Service) => service.tiers.find((tier) => tier.from)?.from ?? null;

/** The real commission pipeline, stage for stage, as your account shows it. */
export const process = [
  {
    step: "01",
    title: "Request",
    text: "Pick a service and tell us what you need, on the website or in our Discord. A few minutes, a few details, any references.",
  },
  {
    step: "02",
    title: "Review & quote",
    text: "We check the scope, ask what we need to, and send a written quote: price, timeline, revisions and exactly what you get.",
  },
  {
    step: "03",
    title: "Approve & deposit",
    text: "Accept the quote in your account. We confirm the deposit with you directly before any work starts.",
  },
  {
    step: "04",
    title: "Build & milestones",
    text: "Work is split into milestones you can follow, with every message in one thread on the site and in Discord.",
  },
  {
    step: "05",
    title: "Deliver & support",
    text: "You review, we polish, then final payment and handover. Support and optional maintenance carry on after.",
  },
];

export const principles = [
  { title: "No templates.", text: "Every project gets its own identity. We don't reskin last month's work." },
  { title: "It has to work.", text: "A beautiful interface is pointless if the thing behind it breaks." },
  { title: "Details matter.", text: "Empty states, error messages, keyboard focus. The small stuff is the product." },
  { title: "Straight talk.", text: "Clear quotes, honest progress updates, and no made-up numbers. Here or in your project." },
];

export const faqs: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "Commissions",
    items: [
      {
        q: "How do I start a project?",
        a: "Pick a service and send a commission request, from the website or from the commission panel in our Discord. Both create the same request, and we reply in one thread you can follow in either place.",
      },
      {
        q: "How much does it cost?",
        a: "Each service lists a starting price, from £10 for small jobs. Anything bigger gets a written quote after we've looked at the scope, and nothing begins until you accept it.",
      },
      {
        q: "How do I pay?",
        a: "Once you accept a quote, we'll confirm the deposit with you directly. Card payments on the site aren't switched on yet, so we'll never ask you to pay anywhere unexpected.",
      },
      {
        q: "Can I see how it's going?",
        a: "Yes. Projects are split into milestones you can follow in your account, and all the messages stay in one conversation.",
      },
      {
        q: "Who owns the finished work?",
        a: "Ownership and usage rights are written into your quote before you accept it, so you know exactly where you stand at handover.",
      },
    ],
  },
  {
    group: "Accounts & security",
    items: [
      {
        q: "Why sign in with Discord?",
        a: "It links your website account to the KUSH Discord, so tickets, roles and commissions stay in sync. We only get your Discord username and avatar, never your password.",
      },
      {
        q: "Can I lock my account down further?",
        a: "Yes. Turn on two-factor authentication with any authenticator app under Security. All KUSH staff have to use it.",
      },
      {
        q: "Where do I find my files?",
        a: "Anything delivered to you shows up in Downloads. Links are signed, expire after a few minutes, and your access is checked every time.",
      },
    ],
  },
  {
    group: "Support",
    items: [
      {
        q: "How do I get help?",
        a: "Open a support ticket from your account, or in the KUSH Discord. Either way it's the same private ticket, visible only to you and the staff handling it.",
      },
      {
        q: "What are vouches?",
        a: "Reviews from verified customers, posted in our Discord with !vouch. Only people who've actually bought from KUSH can leave one, and they show up here unedited.",
      },
      {
        q: "Are the showcase images real client work?",
        a: "No. They're KUSH concept designs, made to show what we can build, and labelled as concepts. Client work only appears once a client has agreed to it.",
      },
    ],
  },
];
