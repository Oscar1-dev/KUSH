import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  supportStatuses,
  supportPriorities,
  type SupportTenant,
  type SupportMember,
  type SupportTicket,
  type SupportTicketDetail,
  type SupportTranscript,
  type Client,
  type Project,
} from "@kush/contracts";
import { useSession, payload, message } from "./session";
import { ApiError } from "./api";
import { exportSupportJson, supportPath, ticketQuery } from "./support-utils";
type Config = SupportTenant["config"];
const nextStatuses: Record<
  SupportTicket["status"],
  readonly SupportTicket["status"][]
> = {
  open: ["pending", "in_progress", "waiting_for_customer", "resolved"],
  pending: ["open", "in_progress", "waiting_for_customer", "resolved"],
  in_progress: ["pending", "waiting_for_customer", "resolved"],
  waiting_for_customer: ["pending", "in_progress", "resolved"],
  resolved: ["in_progress", "waiting_for_customer"],
  reopened: ["pending", "in_progress", "waiting_for_customer", "resolved"],
  closed: [],
};
const initialConfig: Config = {
  categories: [{ key: "general", label: "General support" }],
  retentionDays: null,
  allowReopen: true,
};
export function Support() {
  const { api, user } = useSession();
  const cache = useQueryClient();
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tenants = useQuery({
    queryKey: ["support-tenants"],
    queryFn: () => api<{ tenants: SupportTenant[] }>("/support/tenants"),
    refetchInterval: 15000,
  });
  const tenant = !tenants.isError
    ? tenants.data?.tenants.find((t) => t.id === tenantId)
    : undefined;
  async function mutate(path: string, body: unknown, method = "POST") {
    setError("");
    setBusy(true);
    try {
      const result = await api(path, { ...payload(body), method });
      await cache.invalidateQueries({ queryKey: ["support-tenants"] });
      return result;
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="support">
      <h2 id="support">Support workspace</h2>
      <p className="notice">
        <strong>Source: Local.</strong> Bot: NOT CONNECTED. Guild: NOT
        CONNECTED. This slice stores support records in the local API and
        PostgreSQL. Live Discord channels, bot adapter and server blueprint
        execution remain subsequent slices.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tenants.isPending ? (
        <p>Loading support workspaces…</p>
      ) : tenants.isError ? (
        <p role="alert">{tenants.error.message}</p>
      ) : tenants.data.tenants.length === 0 ? (
        <p>No support workspaces available to your account.</p>
      ) : (
        <label>
          Support workspace
          <select
            value={tenantId}
            onChange={(e) => {
              if (
                !tenantId ||
                window.confirm(
                  "Switch support workspace? Unsaved ticket edits will be discarded.",
                )
              ) {
                setTenantId(e.target.value);
                setError("");
              }
            }}
          >
            <option value="">Choose support workspace</option>
            {tenants.data.tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.currentUserRole}
              </option>
            ))}
          </select>
        </label>
      )}
      {user.role === "admin" && (
        <details>
          <summary>Create support workspace</summary>
          <TenantForm
            busy={busy}
            submit={async (data) => {
              const result = (await mutate("/support/tenants", data)) as {
                tenant: SupportTenant;
              } | null;
              if (result) setTenantId(result.tenant.id);
              return !!result;
            }}
          />
        </details>
      )}
      {tenant && (
        <TenantWorkspace
          key={`${tenant.id}-${tenant.currentUserRole}`}
          tenant={tenant}
          refresh={() => tenants.refetch()}
        />
      )}
      <button onClick={() => void tenants.refetch()}>
        Refresh support workspaces
      </button>
    </section>
  );
}
function TenantForm({
  tenant,
  busy,
  submit,
}: {
  tenant?: SupportTenant;
  busy: boolean;
  submit: (body: unknown) => Promise<boolean>;
}) {
  const { api, user } = useSession();
  const [config, setConfig] = useState<Config>(tenant?.config ?? initialConfig);
  const clients = useQuery({
    queryKey: ["support-association-clients"],
    queryFn: () => api<{ clients: Client[] }>("/clients"),
    enabled: user.role === "admin",
  });
  const projects = useQuery({
    queryKey: ["support-association-projects"],
    queryFn: () => api<{ projects: Project[] }>("/projects"),
    enabled: user.role === "admin",
  });
  const [clientId, setClientId] = useState(tenant?.clientId ?? "");
  const [projectId, setProjectId] = useState(tenant?.projectId ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        void submit({
          name: data.get("name"),
          clientId: clientId || null,
          projectId: data.get("projectId") || null,
          guildId: tenant?.guildId ?? null,
          config,
        });
      }}
    >
      <fieldset disabled={busy}>
        <label>
          Workspace name
          <input
            name="name"
            required
            maxLength={150}
            defaultValue={tenant?.name ?? ""}
          />
        </label>
        {user.role === "admin" ? (
          <>
            <label>
              Associated client
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setProjectId("");
                }}
              >
                <option value="">No associated client</option>
                {clients.data?.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.organisation}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Associated project
              <select
                name="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">No associated project</option>
                {projects.data?.projects
                  .filter((p) => !clientId || p.clientId === clientId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </label>
            {(clients.isError || projects.isError) && (
              <p role="alert">
                Client or project associations unavailable. Refresh the
                workspace before changing associations.
              </p>
            )}
          </>
        ) : (
          <>
            <input
              type="hidden"
              name="projectId"
              value={tenant?.projectId ?? ""}
            />
            <p>
              Business associations can be changed by an application
              administrator.
            </p>
          </>
        )}
        <fieldset>
          <legend>Ticket categories</legend>
          {config.categories.map((category, index) => (
            <div className="record" key={index}>
              <label>
                Category key
                <input
                  required
                  pattern="[a-z0-9_-]{1,40}"
                  maxLength={40}
                  value={category.key}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      categories: config.categories.map((c, i) =>
                        i === index ? { ...c, key: e.target.value } : c,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Category label
                <input
                  required
                  maxLength={100}
                  value={category.label}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      categories: config.categories.map((c, i) =>
                        i === index ? { ...c, label: e.target.value } : c,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                disabled={config.categories.length === 1}
                onClick={() =>
                  setConfig({
                    ...config,
                    categories: config.categories.filter((_, i) => i !== index),
                  })
                }
              >
                Remove category
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={config.categories.length >= 30}
            onClick={() =>
              setConfig({
                ...config,
                categories: [...config.categories, { key: "", label: "" }],
              })
            }
          >
            Add category
          </button>
        </fieldset>
        <label>
          Retention days (blank keeps records indefinitely)
          <input
            type="number"
            min={1}
            max={3650}
            value={config.retentionDays ?? ""}
            onChange={(e) =>
              setConfig({
                ...config,
                retentionDays: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <p className="muted">
          Retention is policy metadata. This slice does not automatically delete
          records.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={config.allowReopen}
            onChange={(e) =>
              setConfig({ ...config, allowReopen: e.target.checked })
            }
          />
          Allow ticket reopening
        </label>
        <button
          disabled={
            user.role === "admin" &&
            (clients.isPending ||
              projects.isPending ||
              clients.isError ||
              projects.isError)
          }
        >
          {tenant ? "Save workspace settings" : "Create workspace"}
        </button>
      </fieldset>
    </form>
  );
}
function TenantWorkspace({
  tenant,
  refresh,
}: {
  tenant: SupportTenant;
  refresh: () => Promise<unknown>;
}) {
  const { api } = useSession();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    priority: "",
    assignedTo: "",
  });
  const owner = tenant.currentUserRole === "owner";
  const staff = tenant.currentUserRole !== "customer";
  const base = supportPath(tenant.id);
  const members = useQuery({
    queryKey: ["support-members", tenant.id],
    queryFn: () => api<{ members: SupportMember[] }>(`${base}/members`),
    enabled: owner,
  });
  const tickets = useQuery({
    queryKey: ["support-tickets", tenant.id, filters],
    queryFn: () =>
      api<{ tickets: SupportTicket[] }>(
        `${base}/tickets${ticketQuery(filters)}`,
      ),
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["support-detail", tenant.id, ticketId],
    queryFn: () =>
      api<SupportTicketDetail>(
        `${base}/tickets/${encodeURIComponent(ticketId)}`,
      ),
    enabled: !!ticketId,
    refetchInterval: 10000,
  });
  async function mutate(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, { ...payload(body), method });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["support-tickets", tenant.id] }),
        cache.invalidateQueries({ queryKey: ["support-detail", tenant.id] }),
        cache.invalidateQueries({ queryKey: ["support-members", tenant.id] }),
        cache.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      return result;
    } catch (e) {
      setError(message(e));
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
        setTicketId("");
        cache.removeQueries({ queryKey: ["support-detail", tenant.id] });
        void refresh();
      } else if (e instanceof ApiError && e.status === 409) {
        void cache.invalidateQueries({
          queryKey: ["support-detail", tenant.id],
        });
      }
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h3>{tenant.name}</h3>
      <p>
        Your workspace role: {tenant.currentUserRole}.{" "}
        {tenant.currentUserRole === "staff"
          ? "Only assigned tickets are available."
          : tenant.currentUserRole === "customer"
            ? "Only your own tickets are available."
            : "Owner access to this workspace."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {owner && (
        <>
          <details>
            <summary>Workspace settings</summary>
            <TenantForm
              key={tenant.updatedAt}
              tenant={tenant}
              busy={busy}
              submit={async (body) => {
                const result = await mutate(base, body, "PATCH");
                if (result) await refresh();
                return !!result;
              }}
            />
          </details>
          <details>
            <summary>Workspace members</summary>
            {members.isError ? (
              <p role="alert">{members.error.message}</p>
            ) : (
              members.data?.members.map((member) => (
                <article key={`${member.userId}-${member.role}`}>
                  <p>
                    {member.email} · {member.role}
                    {member.disabled ? " · account disabled" : ""}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${member.email} from this workspace?`,
                        )
                      )
                        void mutate(
                          `${base}/members/${member.userId}`,
                          undefined,
                          "DELETE",
                        );
                    }}
                  >
                    Remove workspace member
                  </button>
                </article>
              ))
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void mutate(`${base}/members`, {
                  userId: data.get("userId"),
                  role: data.get("role"),
                });
              }}
            >
              <label>
                Existing application user ID
                <input
                  name="userId"
                  required
                  pattern="[0-9a-fA-F-]{36}"
                  placeholder="Existing account UUID"
                />
              </label>
              <label>
                Workspace member role
                <select name="role">
                  <option value="customer">Customer</option>
                  <option value="staff">Staff</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <button disabled={busy}>Save workspace member</button>
              <p>
                Use an existing application account ID. Tenant roles are
                separate from application roles.
              </p>
            </form>
          </details>
        </>
      )}
      <details>
        <summary>Open local ticket</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            void mutate(`${base}/tickets`, {
              requestId: crypto.randomUUID(),
              category: data.get("category"),
              description: data.get("description"),
            }).then((result) => {
              if (result) {
                setTicketId((result as { ticket: SupportTicket }).ticket.id);
                form.reset();
              }
            });
          }}
        >
          <label>
            New ticket category
            <select name="category">
              {tenant.config.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            New ticket description
            <textarea name="description" required maxLength={10000} />
          </label>
          <button disabled={busy}>Create local ticket</button>
          <p>
            Tickets are opened for your signed-in identity. No Discord channel
            is created.
          </p>
        </form>
      </details>
      <fieldset className="record">
        <legend>Ticket filters</legend>
        <label>
          Search tickets
          <input
            value={filters.search}
            maxLength={200}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
        <label>
          Filter ticket status
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All statuses</option>
            {supportStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Filter ticket priority
          <select
            value={filters.priority}
            onChange={(e) =>
              setFilters({ ...filters, priority: e.target.value })
            }
          >
            <option value="">All priorities</option>
            {supportPriorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        {staff && (
          <label>
            Filter assigned user ID
            <input
              value={filters.assignedTo}
              onChange={(e) =>
                setFilters({ ...filters, assignedTo: e.target.value })
              }
            />
          </label>
        )}
      </fieldset>
      {tickets.isPending ? (
        <p>Loading tickets…</p>
      ) : tickets.isError ? (
        <p role="alert">{tickets.error.message}</p>
      ) : tickets.data.tickets.length === 0 ? (
        <p>No tickets match the current filters in your permitted scope.</p>
      ) : (
        <label>
          Selected support ticket
          <select
            value={ticketId}
            onChange={(e) => {
              if (
                !ticketId ||
                window.confirm(
                  "Open another ticket? Unsaved edits will be discarded.",
                )
              )
                setTicketId(e.target.value);
            }}
          >
            <option value="">Choose ticket</option>
            {tickets.data.tickets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.number} · {t.category} · {t.status} · {t.priority}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        onClick={() => {
          void tickets.refetch();
          if (ticketId) void detail.refetch();
        }}
      >
        Refresh tickets
      </button>
      {ticketId &&
        (detail.isPending ? (
          <p>Loading ticket detail…</p>
        ) : detail.isError ? (
          <p role="alert">{detail.error.message}</p>
        ) : (
          <TicketDetail
            key={`${detail.data.ticket.id}-${detail.data.ticket.version}`}
            detail={detail.data}
            tenant={tenant}
            members={members.data?.members ?? []}
            busy={busy}
            mutate={mutate}
            exportTicket={async () => {
              try {
                const transcript = await api<SupportTranscript>(
                  `${base}/tickets/${ticketId}/transcript`,
                );
                exportSupportJson(
                  transcript,
                  `ticket-${detail.data.ticket.number}.json`,
                );
              } catch (e) {
                setError(message(e));
              }
            }}
          />
        ))}
    </div>
  );
}
function TicketDetail({
  detail,
  tenant,
  members,
  busy,
  mutate,
  exportTicket,
}: {
  detail: SupportTicketDetail;
  tenant: SupportTenant;
  members: SupportMember[];
  busy: boolean;
  mutate: (path: string, body: unknown, method?: string) => Promise<unknown>;
  exportTicket: () => Promise<void>;
}) {
  const ticket = detail.ticket;
  const staff = tenant.currentUserRole !== "customer";
  const owner = tenant.currentUserRole === "owner";
  const base = supportPath(tenant.id, `/tickets/${ticket.id}`);
  const closed = ticket.status === "closed";
  return (
    <article>
      <h3>Ticket #{ticket.number}</h3>
      <p>
        Source: Local · {ticket.status} · {ticket.priority} · saved version{" "}
        {ticket.version}
      </p>
      <p>Customer reference: {ticket.customerId}</p>
      <p className="message-content">{ticket.description}</p>
      {ticket.closureReason && <p>Closure reason: {ticket.closureReason}</p>}
      {staff && !closed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void mutate(
              base,
              {
                expectedVersion: ticket.version,
                status: data.get("status"),
                priority: data.get("priority"),
                category: data.get("category"),
                ...(owner
                  ? { assignedUserId: data.get("assignedUserId") || null }
                  : {}),
              },
              "PATCH",
            );
          }}
        >
          <fieldset disabled={busy}>
            <legend>Staff ticket management</legend>
            <label>
              Ticket status
              <select name="status" defaultValue={ticket.status}>
                {supportStatuses
                  .filter(
                    (s) =>
                      s === ticket.status ||
                      nextStatuses[ticket.status].includes(s),
                  )
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </label>
            <label>
              Ticket priority
              <select name="priority" defaultValue={ticket.priority}>
                {supportPriorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Ticket category
              <select name="category" defaultValue={ticket.category}>
                {tenant.config.categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {owner && (
              <label>
                Assigned support staff
                <select
                  name="assignedUserId"
                  defaultValue={ticket.assignedUserId ?? ""}
                >
                  <option value="">Unassigned</option>
                  {members
                    .filter(
                      (m) =>
                        m.role !== "customer" &&
                        !m.disabled &&
                        (m.appRole === "admin" || m.appRole === "operator"),
                    )
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.email} · {m.role}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button>Save ticket changes</button>
          </fieldset>
        </form>
      )}
      <section aria-labelledby="public-messages">
        <h4 id="public-messages">Customer-visible messages</h4>
        {detail.messages.filter((m) => m.kind === "reply").length === 0 ? (
          <p>No public messages yet.</p>
        ) : (
          detail.messages
            .filter((m) => m.kind === "reply")
            .map((m) => (
              <article key={m.id}>
                <p>
                  {m.authorId} · {new Date(m.createdAt).toLocaleString()}
                </p>
                <p className="message-content">{m.content}</p>
              </article>
            ))
        )}
        {!closed && (
          <MessageForm
            kind="reply"
            busy={busy}
            send={(content) =>
              mutate(`${base}/messages`, {
                requestId: crypto.randomUUID(),
                expectedVersion: ticket.version,
                kind: "reply",
                content,
              })
            }
          />
        )}
      </section>
      {staff && (
        <section aria-labelledby="internal-notes">
          <h4 id="internal-notes">Internal staff notes</h4>
          <p>
            Private staff records. Never included in a customer-visible reply.
          </p>
          {detail.messages.filter((m) => m.kind === "note").length === 0 ? (
            <p>No internal notes recorded.</p>
          ) : (
            detail.messages
              .filter((m) => m.kind === "note")
              .map((m) => (
                <article key={m.id}>
                  <p>
                    {m.authorId} · {new Date(m.createdAt).toLocaleString()}
                  </p>
                  <p className="message-content">{m.content}</p>
                </article>
              ))
          )}
          {!closed && (
            <MessageForm
              kind="note"
              busy={busy}
              send={(content) =>
                mutate(`${base}/messages`, {
                  requestId: crypto.randomUUID(),
                  expectedVersion: ticket.version,
                  kind: "note",
                  content,
                })
              }
            />
          )}
        </section>
      )}
      {!closed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (
              window.confirm(
                "Close this local ticket with the supplied reason?",
              )
            )
              void mutate(`${base}/close`, {
                expectedVersion: ticket.version,
                confirm: true,
                reason: data.get("reason"),
              });
          }}
        >
          <label>
            Ticket closure reason
            <textarea name="reason" required maxLength={2000} />
          </label>
          <button disabled={busy}>Close ticket</button>
        </form>
      )}
      {closed && tenant.config.allowReopen && (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm("Reopen this ticket?"))
              void mutate(`${base}/reopen`, {
                expectedVersion: ticket.version,
              });
          }}
        >
          Reopen ticket
        </button>
      )}
      {closed && !tenant.config.allowReopen && (
        <p>Reopening is disabled by workspace policy.</p>
      )}
      <details>
        <summary>Ticket history</summary>
        {detail.events.length ? (
          detail.events.map((event) => (
            <p key={event.id}>
              {new Date(event.createdAt).toLocaleString()} · {event.action}
            </p>
          ))
        ) : (
          <p>No history events returned.</p>
        )}
      </details>
      <button onClick={() => void exportTicket()}>
        Download ticket transcript JSON
      </button>
    </article>
  );
}
function MessageForm({
  kind,
  busy,
  send,
}: {
  kind: "reply" | "note";
  busy: boolean;
  send: (content: string) => Promise<unknown>;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        void send(String(data.get("content"))).then((result) => {
          if (result) form.reset();
        });
      }}
    >
      <label>
        {kind === "note"
          ? "New internal staff note"
          : "New customer-visible reply"}
        <textarea name="content" required maxLength={10000} />
      </label>
      <button disabled={busy}>
        {kind === "note" ? "Save internal note" : "Send public reply"}
      </button>
    </form>
  );
}
