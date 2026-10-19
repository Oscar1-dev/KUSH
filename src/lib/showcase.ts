/**
 * KUSH concept showcases: original designs made to show what each service
 * can produce. They are NOT client work and are always labelled as concepts
 * (each image also carries a "Concept by KUSH" tag). Sources live in
 * design/concepts and are rendered to /public/showcase by design/render.mjs.
 */
export interface Concept {
  id: string;
  service: string;
  tier: "starter" | "standard" | "premium";
  title: string;
  caption: string;
  /** 16:10 landscape, for the website and Discord. */
  image: string;
}

export const concepts: Concept[] = [
  { id: "websites-premium", service: "websites", tier: "premium", title: "Elara Film: photographer portfolio", caption: "An art-directed multi-page portfolio with editorial type and a gallery that leads with the work.", image: "/showcase/websites-premium.png" },
  { id: "websites-standard", service: "websites", tier: "standard", title: "Northside Cuts: one-page business site", caption: "A bold one-pager with prices, booking link and opening times, built mobile-first.", image: "/showcase/websites-standard.png" },
  { id: "webapps-premium", service: "web-apps", tier: "premium", title: "Pulse: analytics dashboard", caption: "A signed-in dashboard with live revenue, orders and top products, built around roles and real data.", image: "/showcase/webapps-premium.png" },
  { id: "webapps-standard", service: "web-apps", tier: "standard", title: "Inkwell: bookings admin", caption: "A focused admin panel for appointments and deposits, replacing a shared spreadsheet.", image: "/showcase/webapps-standard.png" },
  { id: "software-premium", service: "software", tier: "premium", title: "Clipforge: desktop video tool", caption: "A full desktop app with media bin, timeline, inspector and one-click exports for every platform.", image: "/showcase/software-premium.png" },
  { id: "software-standard", service: "software", tier: "standard", title: "Batch Renamer: Windows utility", caption: "A small, focused tool that renames hundreds of files with a live preview and undo.", image: "/showcase/software-standard.png" },
  { id: "discord-premium", service: "discord", tier: "premium", title: "NOVA: integrated ticket system", caption: "Private ticket channels with claims and transcripts, synced both ways with a website.", image: "/showcase/discord-premium.png" },
  { id: "discord-standard", service: "discord", tier: "standard", title: "Pixel Lounge: server setup", caption: "Clean categories, locked info channels, sensible roles and a welcome flow.", image: "/showcase/discord-standard.png" },
  { id: "creative-premium", service: "creative", tier: "premium", title: "Halcyon Coffee: brand identity", caption: "Mark, palette, type and applications: a complete identity board.", image: "/showcase/creative-premium.png" },
  { id: "creative-standard", service: "creative", tier: "standard", title: "Pixel Lounge: server branding pack", caption: "Banner, icons and an emoji set, exported for Discord.", image: "/showcase/creative-standard.png" },
  { id: "automation-premium", service: "automation", tier: "premium", title: "Relay: order workflow", caption: "A multi-step automation with retries, alerts on failure and a live run log.", image: "/showcase/automation-premium.png" },
  { id: "automation-standard", service: "automation", tier: "standard", title: "Shop alerts to Discord", caption: "Store events posted to your team's Discord: new orders, failed payments and a daily summary.", image: "/showcase/automation-standard.png" },
];

export const conceptsFor = (service: string) => concepts.filter((concept) => concept.service === service);
