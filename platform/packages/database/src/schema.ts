import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  boolean,
  integer,
  jsonb,
  primaryKey,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  disabled: boolean("disabled").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  role: text("role", {
    enum: ["admin", "operator", "viewer", "customer"],
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  tenantId: uuid("tenant_id").references(() => supportTenants.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const supportTenants = pgTable("support_tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  guildId: text("guild_id").unique(),
  guildStatus: text("guild_status").notNull().default("unverified"),
  config: jsonb("config").notNull(),
  nextTicketNumber: integer("next_ticket_number").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const supportMembers = pgTable(
  "support_members",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => supportTenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["owner", "staff", "customer"] }).notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId] })],
);
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => supportTenants.id),
    number: integer("number").notNull(),
    customerId: uuid("customer_id").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    assignedUserId: uuid("assigned_user_id"),
    version: integer("version").notNull().default(1),
    description: text("description").notNull(),
    closureReason: text("closure_reason"),
    createRequestId: uuid("create_request_id").notNull(),
    createCategory: text("create_category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.number),
    unique().on(t.tenantId, t.customerId, t.createRequestId),
    foreignKey({
      columns: [t.tenantId, t.customerId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
    foreignKey({
      columns: [t.tenantId, t.assignedUserId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
  ],
);
export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    authorId: uuid("author_id").notNull(),
    kind: text("kind", { enum: ["reply", "note"] }).notNull(),
    content: text("content").notNull(),
    requestId: uuid("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.ticketId],
      foreignColumns: [supportTickets.tenantId, supportTickets.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.authorId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
    unique().on(t.tenantId, t.ticketId, t.authorId, t.requestId),
  ],
);
export const supportEvents = pgTable(
  "support_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    audience: text("audience", { enum: ["public", "staff"] }).notNull(),
    action: text("action").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.ticketId],
      foreignColumns: [supportTickets.tenantId, supportTickets.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.actorId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
  ],
);

export const commercialRequests = pgTable(
  "commercial_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => supportTenants.id),
    requesterId: uuid("requester_id").notNull(),
    kind: text("kind", {
      enum: ["commission", "marketplace", "partner"],
    }).notNull(),
    status: text("status").notNull().default("submitted"),
    title: text("title").notNull(),
    details: text("details").notNull(),
    category: text("category").notNull(),
    approximateBudget: text("approximate_budget"),
    preferredTimeframe: text("preferred_timeframe"),
    productUrl: text("product_url"),
    assignedUserId: uuid("assigned_user_id"),
    reviewNote: text("review_note"),
    version: integer("version").notNull().default(1),
    createRequestId: uuid("create_request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.requesterId, t.createRequestId),
    index("commercial_requests_tenant_status_idx").on(
      t.tenantId,
      t.kind,
      t.status,
      t.createdAt,
    ),
    foreignKey({
      columns: [t.tenantId, t.requesterId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
    foreignKey({
      columns: [t.tenantId, t.assignedUserId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
  ],
);

export const discordAccountLinks = pgTable(
  "discord_account_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => supportTenants.id),
    userId: uuid("user_id").notNull(),
    discordUserId: text("discord_user_id"),
    state: text("state", { enum: ["pending", "verified", "revoked"] })
      .notNull()
      .default("pending"),
    codeHash: text("code_hash").notNull(),
    requestId: uuid("request_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.tenantId, t.userId),
    unique().on(t.tenantId, t.requestId),
    unique().on(t.tenantId, t.discordUserId),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [supportMembers.tenantId, supportMembers.userId],
    }),
  ],
);

export const discordLinkAttempts = pgTable(
  "discord_link_attempts",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => supportTenants.id),
    discordUserId: text("discord_user_id").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.discordUserId] })],
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisation: text("organisation").notNull(),
  contactEmail: text("contact_email").notNull(),
  notes: text("notes").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    document: jsonb("document").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("projects_client_idx").on(t.clientId)],
);
