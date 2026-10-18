/**
 * Public website content. Everything here describes what KUSH offers and
 * how the real commission workflow works. No invented clients, statistics,
 * prices or testimonials: vouches come only from the live vouch system.
 */

export interface Service {
  slug: string;
  index: string;
  name: string;
  /** One line for cards and menus. */
  summary: string;
  headline: [string, string];
  intro: string;
  offerings: { title: string; text: string }[];
  deliverables: string[];
  goodFit: string[];
}

export const services: Service[] = [
  {
    slug: "custom-development",
    index: "01",
    name: "Custom Development",
    summary: "Bespoke systems, integrations, automation and bots built around how you actually work.",
    headline: ["Built for", "your problem."],
    intro:
      "When off-the-shelf tools don't fit, we build the thing that does: back-end services, APIs, integrations between the tools you already use, and automation that removes repetitive work.",
    offerings: [
      { title: "APIs & back-end services", text: "Reliable services with clear contracts, authentication and audit trails, designed to be maintained, not just shipped." },
      { title: "Integrations", text: "Connect payment providers, CRMs, storage and internal tools so data moves without copy and paste." },
      { title: "Automation", text: "Scheduled jobs, workflows and queues that retry safely, so a failure is reported instead of silently lost." },
      { title: "Discord systems", text: "Ticketing, onboarding, role sync and moderation bots. The KUSH community runs on one we built ourselves." },
    ],
    deliverables: ["Source code you own", "Technical documentation", "Deployment notes", "Handover session"],
    goodFit: ["You've outgrown spreadsheets or manual steps", "Two tools need to talk to each other", "You need a bot or service that just keeps working"],
  },
  {
    slug: "websites",
    index: "02",
    name: "Websites & Web Applications",
    summary: "Fast, accessible sites and full web apps, from marketing pages to signed-in dashboards.",
    headline: ["Sites that", "do the work."],
    intro:
      "Distinctive websites and web applications with real engineering underneath: accounts, dashboards, payments-ready flows and content you can manage, built to be fast on every device.",
    offerings: [
      { title: "Marketing & brand sites", text: "Art-directed sites with considered motion that stays out of the way of the content." },
      { title: "Web applications", text: "Signed-in products with accounts, roles, two-factor authentication and the dashboards behind them." },
      { title: "Performance & accessibility", text: "Semantic markup, keyboard support, reduced-motion support and pages that load quickly on mobile." },
      { title: "Content & SEO foundations", text: "Clean structure, metadata and editable content so the site stays current after launch." },
    ],
    deliverables: ["Responsive build", "Accessibility review", "Analytics-ready setup", "Launch checklist"],
    goodFit: ["You need more than a template", "Your site needs accounts or a dashboard", "Speed and polish matter to your brand"],
  },
  {
    slug: "software",
    index: "03",
    name: "Software & Desktop Applications",
    summary: "Desktop tools and cross-platform software with installers, updates and licensing.",
    headline: ["Software", "with substance."],
    intro:
      "Desktop and cross-platform applications that feel at home on the machine they run on, with the unglamorous parts done properly: installers, updates, licensing and crash reporting.",
    offerings: [
      { title: "Desktop applications", text: "Cross-platform or Windows-first tools, chosen per project for what the software needs to do." },
      { title: "Licensing & distribution", text: "Licence keys, protected downloads and update channels tied to customer accounts." },
      { title: "Internal tools", text: "Focused utilities for your team that replace fragile scripts and manual processes." },
      { title: "Maintenance", text: "Updates, fixes and compatibility work after release, agreed up front." },
    ],
    deliverables: ["Signed builds where applicable", "Installer & update path", "User documentation", "Source code"],
    goodFit: ["Your users work on the desktop", "You want to sell or license software", "A script has become business-critical"],
  },
  {
    slug: "ui-ux-design",
    index: "04",
    name: "UI/UX Design",
    summary: "Interfaces, flows and design systems that make complex products feel obvious.",
    headline: ["Clarity,", "by design."],
    intro:
      "Product and interface design grounded in how people actually use things: flows, wireframes, high-fidelity interfaces and design systems your developers can build from.",
    offerings: [
      { title: "Product & flow design", text: "Map the journeys that matter, then remove the steps that don't." },
      { title: "Interface design", text: "High-fidelity screens with states for loading, empty, error and success, not just the happy path." },
      { title: "Design systems", text: "Tokens, components and usage rules that keep a product consistent as it grows." },
      { title: "Prototypes", text: "Clickable prototypes to test an idea before committing to building it." },
    ],
    deliverables: ["Design files", "Component library", "Interaction notes", "Developer handoff"],
    goodFit: ["Your product works but feels hard to use", "You're starting a product from scratch", "Your interface has drifted out of consistency"],
  },
  {
    slug: "creative",
    index: "05",
    name: "Creative Services",
    summary: "Brand identity, motion and visual design with a point of view.",
    headline: ["Look", "different."],
    intro:
      "Identity and visual work for brands that don't want to blend in: logos and visual systems, motion, graphics for launches and community spaces, and art direction across all of it.",
    offerings: [
      { title: "Brand identity", text: "Marks, type, colour and the rules that hold them together." },
      { title: "Motion design", text: "Animated logos, product motion and short-form visuals." },
      { title: "Launch & social graphics", text: "Campaign visuals sized and exported for the places they'll actually be used." },
      { title: "Community branding", text: "Discord server art, banners, emoji and panels that match your brand." },
    ],
    deliverables: ["Master artwork files", "Exports for each platform", "Brand guidelines", "Usage rights as agreed"],
    goodFit: ["You're launching something new", "Your brand looks inconsistent across platforms", "You want a community space that feels yours"],
  },
];

export const serviceBySlug = (slug: string) => services.find((service) => service.slug === slug);

/** The real commission workflow, step for step, as it runs in KUSH accounts. */
export const process = [
  {
    step: "01",
    title: "Request",
    text: "Tell us what you need from your KUSH account. It takes a few minutes and you can attach references.",
  },
  {
    step: "02",
    title: "Scope & quote",
    text: "We review it, ask questions if needed and send a quote to your account. Nothing starts until you accept it.",
  },
  {
    step: "03",
    title: "Build in milestones",
    text: "Work is split into milestones you can follow in your account, with every message kept in one thread.",
  },
  {
    step: "04",
    title: "Review & delivery",
    text: "You review, we refine, then files and downloads are delivered through your account. Support stays open afterwards.",
  },
];

export const principles = [
  { title: "Original by design.", text: "Every project gets its own identity. We don't reskin templates." },
  { title: "Function over fiction.", text: "A beautiful interface means nothing if the software behind it doesn't work." },
  { title: "Detail is everything.", text: "Empty states, error messages, keyboard focus: the small things are the product." },
  { title: "Honest by default.", text: "Clear quotes, real progress and no invented numbers, on this site or in your project." },
];

export const faqs: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "Working with KUSH",
    items: [
      {
        q: "How do I start a project?",
        a: "Sign in with Discord, then open a commission request from your account. Describe what you need and attach any references. We'll reply in the same thread.",
      },
      {
        q: "How is a project priced?",
        a: "Every project is quoted individually once we understand the scope. The quote appears in your account and work only begins after you accept it.",
      },
      {
        q: "Can I follow progress?",
        a: "Yes. Commissions are split into milestones you can see in your account, and every message lives in one conversation so nothing gets lost.",
      },
      {
        q: "Who owns the finished work?",
        a: "Ownership and usage rights are set out in your quote before you accept it, so there are no surprises at handover.",
      },
    ],
  },
  {
    group: "Accounts & security",
    items: [
      {
        q: "Why do I sign in with Discord?",
        a: "One sign-in links your website account and the KUSH Discord, so tickets, roles and purchases stay in sync. We only receive your Discord username and avatar, never your password.",
      },
      {
        q: "Can I protect my account further?",
        a: "Yes. Turn on two-factor authentication with any authenticator app in Security. It's required for all KUSH staff.",
      },
      {
        q: "Where do I get my files?",
        a: "Purchased products and delivered work appear in Downloads. Download links are signed and expire after a few minutes, and your access is re-checked each time.",
      },
    ],
  },
  {
    group: "Support",
    items: [
      {
        q: "How do I get help?",
        a: "Open a support ticket from your account or in the KUSH Discord. Both create the same private ticket, visible only to you and the staff who need it.",
      },
      {
        q: "What are vouches?",
        a: "Reviews from verified customers, posted in our Discord with !vouch. Only people who've bought from KUSH can leave one, and they appear on the Vouches page unedited.",
      },
    ],
  },
];
