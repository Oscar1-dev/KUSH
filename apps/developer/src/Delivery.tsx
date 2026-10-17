import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Client,
  Project,
  ProjectUpdate,
  DeliveryChecklistItem,
} from "@kush/contracts";
import { useSession, payload, message } from "./session";

function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function Delivery() {
  const { api, user } = useSession();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const writable = user.role !== "viewer";
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => api<{ clients: Client[] }>("/clients"),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/projects"),
    retry: false,
  });
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, payload(body));
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["clients"] }),
        cache.invalidateQueries({ queryKey: ["projects"] }),
        cache.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function exportRecord(path: string, name: string) {
    try {
      download(await api(path), name);
    } catch (e) {
      setError(message(e));
    }
  }
  const project = projects.data?.projects.find((p) => p.id === selected);
  return (
    <section aria-labelledby="delivery">
      <h2 id="delivery">Clients and delivery</h2>
      <p>
        Record agreed work, client approval evidence and handover. Approval
        records are internal acknowledgements, not electronic signatures.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h3>Clients</h3>
      {clients.isPending ? (
        <p>Loading clients…</p>
      ) : clients.isError ? (
        <p role="alert">{clients.error.message}</p>
      ) : clients.data.clients.length === 0 ? (
        <p>No clients yet. Create a client to scope your first project.</p>
      ) : (
        clients.data.clients.map((client) => (
          <details key={`${client.id}-${client.version}`}>
            <summary>
              {client.organisation}
              {client.archived ? " · archived" : ""}
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void mutate(`/clients/${client.id}`, {
                  expectedVersion: client.version,
                  organisation: data.get("organisation"),
                  contactEmail: data.get("contactEmail"),
                  notes: data.get("notes"),
                  archived: data.get("archived") === "on",
                });
              }}
            >
              <fieldset disabled={!writable || busy}>
                <label>
                  Organisation
                  <input
                    name="organisation"
                    defaultValue={client.organisation}
                    required
                    maxLength={160}
                  />
                </label>
                <label>
                  Contact email
                  <input
                    name="contactEmail"
                    type="email"
                    defaultValue={client.contactEmail}
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Client notes
                  <textarea
                    name="notes"
                    defaultValue={client.notes}
                    maxLength={4000}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="archived"
                    defaultChecked={client.archived}
                  />
                  Archived
                </label>
                <button>Save client</button>
              </fieldset>
            </form>
            <button
              onClick={() =>
                void exportRecord(
                  `/clients/${client.id}/export`,
                  `client-${client.id}.json`,
                )
              }
            >
              Export client JSON
            </button>
          </details>
        ))
      )}
      {writable && (
        <details>
          <summary>Create client</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              void mutate("/clients", {
                organisation: data.get("organisation"),
                contactEmail: data.get("contactEmail"),
                notes: data.get("notes"),
              }).then((ok) => {
                if (ok) form.reset();
              });
            }}
          >
            <label>
              Organisation
              <input name="organisation" required maxLength={160} />
            </label>
            <label>
              Contact email
              <input
                name="contactEmail"
                type="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Client notes
              <textarea name="notes" maxLength={4000} />
            </label>
            <button disabled={busy}>Create client</button>
          </form>
        </details>
      )}
      <h3>Projects</h3>
      {projects.isPending ? (
        <p>Loading projects…</p>
      ) : projects.isError ? (
        <p role="alert">{projects.error.message}</p>
      ) : projects.data.projects.length === 0 ? (
        <p>No projects yet. Add a client, then create a project.</p>
      ) : (
        <label>
          Selected project
          <select
            value={selected}
            onChange={(e) => {
              if (
                !selected ||
                window.confirm(
                  "Open another project? Unsaved edits will be discarded.",
                )
              )
                setSelected(e.target.value);
            }}
          >
            <option value="">Choose project</option>
            {projects.data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {p.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {writable && (
        <details>
          <summary>Create project</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              void mutate("/projects", {
                clientId: data.get("clientId"),
                title: data.get("title"),
                scope: data.get("scope"),
              }).then((ok) => {
                if (ok) form.reset();
              });
            }}
          >
            <label>
              Project client
              <select name="clientId" required>
                <option value="">Choose client</option>
                {clients.data?.clients
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.organisation}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Project title
              <input name="title" required maxLength={200} />
            </label>
            <label>
              Initial scope
              <textarea name="scope" required maxLength={6000} />
            </label>
            <button
              disabled={busy || !clients.data?.clients.some((c) => !c.archived)}
            >
              Create project
            </button>
          </form>
        </details>
      )}
      {project && (
        <ProjectEditor
          key={`${project.id}-${project.version}`}
          project={project}
          writable={writable}
          busy={busy}
          save={(body) => mutate(`/projects/${project.id}`, body)}
          approve={(body) => mutate(`/projects/${project.id}/approve`, body)}
          exportProject={() =>
            void exportRecord(
              `/projects/${project.id}/export`,
              `project-${project.id}.json`,
            )
          }
        />
      )}
      <button
        onClick={() => {
          void clients.refetch();
          void projects.refetch();
        }}
      >
        Refresh saved records
      </button>
    </section>
  );
}

type EditorProps = {
  project: Project;
  writable: boolean;
  busy: boolean;
  save: (body: ProjectUpdate) => Promise<boolean>;
  approve: (body: unknown) => Promise<boolean>;
  exportProject: () => void;
};
function ProjectEditor({
  project,
  writable,
  busy,
  save,
  approve,
  exportProject,
}: EditorProps) {
  const [draft, setDraft] = useState<ProjectUpdate>({
    expectedVersion: project.version,
    title: project.title,
    scope: project.scope,
    status: project.status,
    proposal: project.proposal,
    tasks: project.tasks,
    deliverables: project.deliverables,
    acceptanceChecks: project.acceptanceChecks,
    handover: project.handover,
    handoverNotes: project.handoverNotes,
  });
  const locked = !!project.approval || project.status === "archived";
  const terminal =
    project.status === "archived" || project.status === "delivered";
  function checklist(
    key: "deliverables" | "acceptanceChecks",
    items: DeliveryChecklistItem[],
  ) {
    setDraft({ ...draft, [key]: items });
  }
  return (
    <article>
      <h3>{project.title}</h3>
      <p>
        Saved version {project.version} · {project.status}
      </p>
      {project.approval && (
        <p className="notice">
          Approval recorded from {project.approval.approvedBy} on{" "}
          {new Date(project.approval.approvedAt).toLocaleString()}. Evidence:{" "}
          {project.approval.approvalEvidence}. Scope, proposal and checklist
          definitions are locked. Changed commercial terms require a new
          project.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(draft);
        }}
      >
        <fieldset disabled={!writable || busy || terminal}>
          <label>
            Title
            <input
              required
              maxLength={200}
              value={draft.title}
              disabled={locked}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Scope
            <textarea
              required
              maxLength={6000}
              value={draft.scope}
              disabled={locked}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
            />
          </label>
          <h4>Proposal</h4>
          {!draft.proposal ? (
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                setDraft({
                  ...draft,
                  proposal: { pricePence: 0, revisionLimit: 0, terms: "" },
                })
              }
            >
              Add proposal
            </button>
          ) : (
            <>
              <label>
                Price (GBP pence)
                <input
                  type="number"
                  min={0}
                  max={100000000}
                  step={1}
                  required
                  disabled={locked}
                  value={draft.proposal.pricePence}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      proposal: {
                        ...draft.proposal!,
                        pricePence: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Included revisions
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  disabled={locked}
                  value={draft.proposal.revisionLimit}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      proposal: {
                        ...draft.proposal!,
                        revisionLimit: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Ownership, payment and service terms
                <textarea
                  required
                  maxLength={6000}
                  disabled={locked}
                  value={draft.proposal.terms}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      proposal: { ...draft.proposal!, terms: e.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
          <h4>Deliverables</h4>
          <Checklist
            items={draft.deliverables}
            locked={locked}
            change={(items) => checklist("deliverables", items)}
          />
          <h4>Acceptance checks</h4>
          <Checklist
            items={draft.acceptanceChecks}
            locked={locked}
            change={(items) => checklist("acceptanceChecks", items)}
          />
          <h4>Tasks</h4>
          {draft.tasks.length === 0 && <p>No tasks recorded.</p>}
          {draft.tasks.map((task, index) => (
            <div className="record" key={task.id}>
              <label>
                Task title
                <input
                  required
                  maxLength={300}
                  value={task.title}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tasks: draft.tasks.map((t, i) =>
                        i === index ? { ...t, title: e.target.value } : t,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Task notes
                <textarea
                  maxLength={2000}
                  value={task.notes}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tasks: draft.tasks.map((t, i) =>
                        i === index ? { ...t, notes: e.target.value } : t,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={task.dueDate ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tasks: draft.tasks.map((t, i) =>
                        i === index
                          ? { ...t, dueDate: e.target.value || null }
                          : t,
                      ),
                    })
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tasks: draft.tasks.map((t, i) =>
                        i === index ? { ...t, completed: e.target.checked } : t,
                      ),
                    })
                  }
                />
                Task complete
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    tasks: draft.tasks.filter((_, i) => i !== index),
                  })
                }
              >
                Remove task
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={draft.tasks.length >= 100}
            onClick={() =>
              setDraft({
                ...draft,
                tasks: [
                  ...draft.tasks,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    notes: "",
                    dueDate: null,
                    completed: false,
                  },
                ],
              })
            }
          >
            Add task
          </button>
          <h4>Handover</h4>
          {(
            [
              "ownership",
              "access",
              "documentation",
              "backup",
              "support",
            ] as const
          ).map((key) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={draft.handover[key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    handover: { ...draft.handover, [key]: e.target.checked },
                  })
                }
              />
              {
                {
                  ownership: "Ownership confirmed",
                  access: "Access transferred",
                  documentation: "Documentation supplied",
                  backup: "Backup or recovery explained",
                  support: "Support boundaries confirmed",
                }[key]
              }
            </label>
          ))}
          <label>
            Maintenance scope
            <textarea
              maxLength={2000}
              value={draft.handover.maintenanceScope}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  handover: {
                    ...draft.handover,
                    maintenanceScope: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Handover notes
            <textarea
              maxLength={4000}
              value={draft.handoverNotes}
              onChange={(e) =>
                setDraft({ ...draft, handoverNotes: e.target.value })
              }
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as ProjectUpdate["status"],
                })
              }
            >
              <option value="draft" disabled={project.status !== "draft"}>
                Draft
              </option>
              <option value="active" disabled={!project.approval}>
                Active
              </option>
              <option
                value="ready_for_handover"
                disabled={!project.approval || project.status === "draft"}
              >
                Ready for handover
              </option>
              <option
                value="delivered"
                disabled={project.status !== "ready_for_handover"}
              >
                Delivered
              </option>
              <option value="archived">Archived (terminal)</option>
            </select>
          </label>
          <p className="muted">
            Save proposal and checklist definitions before recording approval.
            Active requires approval; ready requires completed deliverables and
            acceptance evidence; delivered also requires the complete handover
            checklist and notes.
          </p>
          <button>Save project</button>
        </fieldset>
      </form>
      {writable && !locked && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (
              window.confirm(
                "Record client approval of the SAVED scope, proposal and checklists? These definitions will become immutable. Save edits first.",
              )
            )
              void approve({
                expectedVersion: project.version,
                approvedBy: data.get("approvedBy"),
                approvalEvidence: data.get("approvalEvidence"),
              });
          }}
        >
          <h4>Record client approval</h4>
          <p>
            Save all project edits first. Record only approval actually received
            from the client.
          </p>
          <label>
            Approved by
            <input name="approvedBy" required maxLength={200} />
          </label>
          <label>
            Approval evidence
            <textarea name="approvalEvidence" required maxLength={2000} />
          </label>
          <button disabled={busy || !project.proposal}>
            Record approval of saved proposal
          </button>
        </form>
      )}
      {writable && project.status === "delivered" && (
        <button
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Archive this delivered project? It will remain read-only.",
              )
            )
              void save({ ...draft, status: "archived" });
          }}
        >
          Archive delivered project
        </button>
      )}
      <button onClick={exportProject}>Export project JSON</button>
    </article>
  );
}
function Checklist({
  items,
  locked,
  change,
}: {
  items: DeliveryChecklistItem[];
  locked: boolean;
  change: (items: DeliveryChecklistItem[]) => void;
}) {
  return (
    <>
      {items.length === 0 && <p>No items recorded.</p>}
      {items.map((item, index) => (
        <div className="record" key={item.id}>
          <label>
            Checklist item
            <input
              required
              maxLength={300}
              disabled={locked}
              value={item.title}
              onChange={(e) =>
                change(
                  items.map((v, i) =>
                    i === index ? { ...v, title: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={(e) =>
                change(
                  items.map((v, i) =>
                    i === index ? { ...v, completed: e.target.checked } : v,
                  ),
                )
              }
            />
            Completed
          </label>
          <label>
            Evidence
            <textarea
              maxLength={2000}
              value={item.evidence}
              onChange={(e) =>
                change(
                  items.map((v, i) =>
                    i === index ? { ...v, evidence: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          {!locked && (
            <button
              type="button"
              onClick={() => change(items.filter((_, i) => i !== index))}
            >
              Remove item
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <button
          type="button"
          disabled={items.length >= 100}
          onClick={() =>
            change([
              ...items,
              {
                id: crypto.randomUUID(),
                title: "",
                completed: false,
                evidence: "",
              },
            ])
          }
        >
          Add checklist item
        </button>
      )}
    </>
  );
}
