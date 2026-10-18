// Opens the staff positions people can apply for on the website.
// Discord role IDs come from the bot configuration (.local/discord.json).
// Safe to re-run: updates text and roles, never deletes positions or
// applications.  node scripts/seed-staff-positions.mjs [--apply]
import { readFile } from "node:fs/promises";
import { configuration, databaseClient } from "./runtime.mjs";

const POSITIONS = [
  {
    key: "support-agent",
    title: "Support Agent",
    staffRole: "support",
    roleKey: "support-staff",
    summary: "Help KUSH customers through support tickets on the website and in Discord.",
    responsibilities: "Claim and answer support tickets\nKeep customers updated until issues are resolved\nEscalate billing and technical problems to the right people",
    requirements: "Clear, friendly written English\nPatience and good judgement\nAvailability for regular shifts",
    portfolioRequired: false,
  },
  {
    key: "community-moderator",
    title: "Community Moderator",
    staffRole: "moderator",
    roleKey: "moderator",
    summary: "Keep the KUSH Discord welcoming and safe, and handle member reports.",
    responsibilities: "Review member reports\nApply the server rules fairly and consistently\nRecord moderation actions",
    requirements: "Experience moderating online communities\nCalm under pressure\nGood knowledge of Discord",
    portfolioRequired: false,
  },
  {
    key: "developer",
    title: "Developer",
    staffRole: "developer",
    roleKey: "developer",
    summary: "Build websites and software for KUSH commissions and internal tools.",
    responsibilities: "Deliver assigned commission work\nUpdate project progress for customers\nReview and maintain code quality",
    requirements: "Professional or substantial personal development experience\nA portfolio or code samples",
    portfolioRequired: true,
  },
  {
    key: "commission-manager",
    title: "Commission Manager",
    staffRole: "manager",
    roleKey: "commission-manager",
    summary: "Run commissions from enquiry to delivery: scoping, quotes and coordinating developers.",
    responsibilities: "Review enquiries and scope projects\nPrepare quotes with the customer\nAssign and oversee developers",
    requirements: "Project or client management experience\nExcellent communication",
    portfolioRequired: false,
  },
];

const discord = JSON.parse(await readFile(new URL("../.local/discord.json", import.meta.url), "utf8"));
const rows = POSITIONS.map((p) => ({ ...p, roleId: discord.roleIds[p.roleKey] ?? null }));
console.table(rows.map(({ key, title, staffRole, roleKey, roleId }) => ({ key, title, staffRole, roleKey, roleId })));
if (rows.some((r) => !r.roleId)) throw new Error("A position's Discord role is not configured");
if (!process.argv.includes("--apply")) {
  console.log("Dry run. Re-run with --apply to write.");
  process.exit(0);
}
const client = databaseClient(await configuration());
await client.connect();
try {
  for (const p of rows)
    await client.query(
      `INSERT INTO staff_positions(tenant_id,key,title,summary,responsibilities,requirements,staff_role,discord_role_id,portfolio_required)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id,key) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,
         responsibilities=EXCLUDED.responsibilities,requirements=EXCLUDED.requirements,staff_role=EXCLUDED.staff_role,
         discord_role_id=EXCLUDED.discord_role_id,portfolio_required=EXCLUDED.portfolio_required`,
      [discord.supportTenantId, p.key, p.title, p.summary, p.responsibilities, p.requirements, p.staffRole, p.roleId, p.portfolioRequired],
    );
  console.log(`Applied ${rows.length} positions.`);
} finally {
  await client.end();
}
