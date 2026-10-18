/**
 * Public website copy. Describes what KUSH actually offers and how the real
 * commission workflow runs. No invented clients, stats, prices or reviews:
 * vouches only ever come from the live vouch system.
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
    summary: "The tool you couldn't find, so we build it. APIs, integrations, automation and bots.",
    headline: ["Built for", "your problem."],
    intro:
      "Sometimes nothing off the shelf fits how you work. That's where we come in: back-ends, APIs, integrations between the tools you already pay for, and automation that takes the boring jobs off your plate.",
    offerings: [
      { title: "APIs & back-ends", text: "Services with proper authentication, logging and audit trails. Built to be looked after, not just launched." },
      { title: "Integrations", text: "Get your payments, CRM, storage and internal tools talking to each other, so nobody's copying data between tabs." },
      { title: "Automation", text: "Scheduled jobs and queues that retry when something fails, and tell you about it instead of failing quietly." },
      { title: "Discord bots", text: "Tickets, onboarding, role sync and moderation. Our own community runs on one we built, so we know the edge cases." },
    ],
    deliverables: ["Source code that's yours", "Technical docs", "Deployment notes", "A proper handover"],
    goodFit: ["You've outgrown spreadsheets and manual steps", "Two of your tools need to share data", "You need a bot or service that just keeps running"],
  },
  {
    slug: "websites",
    index: "02",
    name: "Websites & Web Apps",
    summary: "Fast, good-looking sites and full web apps, from a landing page to a signed-in dashboard.",
    headline: ["Sites that", "do the work."],
    intro:
      "Websites with personality and web apps with real engineering underneath: accounts, dashboards, payments-ready checkout flows and content you can edit yourself. Quick on a phone, not just on our monitors.",
    offerings: [
      { title: "Brand & marketing sites", text: "Art-directed, with motion that adds something rather than getting in the way." },
      { title: "Web applications", text: "Products people sign in to, with roles, two-factor authentication and the admin side to run them." },
      { title: "Speed & accessibility", text: "Clean markup, keyboard support, reduced-motion support, and pages that load fast on mobile data." },
      { title: "Content & SEO basics", text: "Sensible structure and metadata, and content you can update without calling us." },
    ],
    deliverables: ["Responsive build", "Accessibility pass", "Analytics set up", "Launch checklist"],
    goodFit: ["A template won't cut it", "Your site needs accounts or a dashboard", "Your brand lives or dies on first impressions"],
  },
  {
    slug: "software",
    index: "03",
    name: "Software & Desktop Apps",
    summary: "Desktop tools and cross-platform software, with installers, updates and licensing sorted.",
    headline: ["Software", "with substance."],
    intro:
      "Desktop and cross-platform apps that feel at home on the machine they run on. We handle the dull-but-vital parts too: installers, auto-updates, licence keys and crash reports.",
    offerings: [
      { title: "Desktop apps", text: "Cross-platform or Windows-first, picked to suit what the software needs to do." },
      { title: "Licensing & delivery", text: "Licence keys, protected downloads and update channels linked to customer accounts." },
      { title: "Internal tools", text: "Small, focused utilities that replace the fragile script someone wrote three years ago." },
      { title: "Ongoing support", text: "Updates, fixes and compatibility work after launch, agreed before we start." },
    ],
    deliverables: ["Signed builds where it applies", "Installer & update path", "User guide", "Source code"],
    goodFit: ["Your users live on the desktop", "You want to sell or license software", "A script has quietly become business-critical"],
  },
  {
    slug: "ui-ux-design",
    index: "04",
    name: "UI/UX Design",
    summary: "Interfaces and flows that make complicated things feel obvious.",
    headline: ["Clarity,", "by design."],
    intro:
      "Product and interface design based on how people actually use things. Flows, wireframes, polished screens and design systems your developers can build straight from.",
    offerings: [
      { title: "Flows & journeys", text: "Map the paths that matter most, then cut the steps that don't need to be there." },
      { title: "Interface design", text: "Every screen designed for loading, empty and error states too, not just the perfect-day version." },
      { title: "Design systems", text: "Tokens, components and rules that keep a product consistent as it grows." },
      { title: "Prototypes", text: "Clickable prototypes so you can test an idea before paying to build it." },
    ],
    deliverables: ["Design files", "Component library", "Interaction notes", "Developer handoff"],
    goodFit: ["Your product works but people find it confusing", "You're starting from a blank page", "Your UI has drifted into ten different styles"],
  },
  {
    slug: "creative",
    index: "05",
    name: "Creative & Branding",
    summary: "Logos, identity, motion and graphics for brands that refuse to blend in.",
    headline: ["Look", "different."],
    intro:
      "Identity and visual work with a point of view. Logos and full visual systems, motion, launch graphics and community spaces, all art-directed so they feel like one brand.",
    offerings: [
      { title: "Brand identity", text: "Logo, type, colour and the rules that hold them together." },
      { title: "Motion", text: "Animated logos, product motion and short-form visuals." },
      { title: "Launch & social", text: "Campaign graphics sized and exported for where they'll actually be posted." },
      { title: "Community branding", text: "Discord server art, banners, emoji and panels that match your brand." },
    ],
    deliverables: ["Master artwork files", "Exports for every platform", "Brand guidelines", "Usage rights as agreed"],
    goodFit: ["You're launching something new", "Your brand looks different everywhere it appears", "You want a community space that feels like yours"],
  },
];

export const serviceBySlug = (slug: string) => services.find((service) => service.slug === slug);

/** The real commission workflow, step for step, as it runs in KUSH accounts. */
export const process = [
  {
    step: "01",
    title: "Tell us the idea",
    text: "Send a request from your KUSH account. A few minutes, a few details, any references you've got.",
  },
  {
    step: "02",
    title: "Get a quote",
    text: "We read it properly, ask what we need to, and post a quote to your account. Nothing starts until you say yes.",
  },
  {
    step: "03",
    title: "Watch it come together",
    text: "The work's split into milestones you can track. Every message lives in one thread, so nothing gets lost.",
  },
  {
    step: "04",
    title: "Sign off & download",
    text: "You review, we polish, then your files land in your account. Support doesn't stop when the project does.",
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
    group: "Working with KUSH",
    items: [
      {
        q: "How do I start a project?",
        a: "Sign in with Discord, then send a commission request from your account. Tell us what you're after and attach anything useful. We'll reply in the same thread.",
      },
      {
        q: "How much does it cost?",
        a: "It depends on the project, so every job gets its own quote once we understand it. You'll see it in your account, and nothing begins until you accept it.",
      },
      {
        q: "Can I see how it's going?",
        a: "Yes. Projects are broken into milestones you can follow in your account, and all the messages stay in one conversation.",
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
        a: "It links your website account to the KUSH Discord, so tickets, roles and purchases stay in sync. We only get your Discord username and avatar, never your password.",
      },
      {
        q: "Can I lock my account down further?",
        a: "Yes. Turn on two-factor authentication with any authenticator app under Security. All KUSH staff have to use it.",
      },
      {
        q: "Where do I find my files?",
        a: "Anything you've bought or had delivered shows up in Downloads. Links are signed, expire after a few minutes, and your access is checked every time.",
      },
    ],
  },
  {
    group: "Support",
    items: [
      {
        q: "How do I get help?",
        a: "Open a support ticket from your account, or in the KUSH Discord. Either way it's the same private ticket, only visible to you and the staff handling it.",
      },
      {
        q: "What are vouches?",
        a: "Reviews from verified customers, posted in our Discord with !vouch. Only people who've actually bought from KUSH can leave one, and they show up here unedited.",
      },
    ],
  },
];
