import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, payload, message } from "./session";
type ManagedUser = {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
  createdAt: string;
};
export function Administration() {
  const { api, user } = useSession();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: ManagedUser[] }>("/admin/users"),
    retry: false,
  });
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, payload(body));
      await cache.invalidateQueries({ queryKey: ["users"] });
      await cache.invalidateQueries({ queryKey: ["activity"] });
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="users">
      <h2 id="users">User administration</h2>
      <p>
        Administrator actions revoke affected sessions. Protect the last enabled
        administrator.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          void mutate("/admin/users", {
            email: data.get("email"),
            password: data.get("password"),
            role: data.get("role"),
          }).then((ok) => {
            if (ok) form.reset();
          });
        }}
      >
        <h3>Create account</h3>
        <label>
          New account email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <label>
          Initial password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={14}
            maxLength={1024}
            required
          />
        </label>
        <label>
          Initial role
          <select name="role">
            <option value="viewer">Viewer</option>
            <option value="customer">Support customer</option>
            <option value="operator">Operator</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <button disabled={busy}>Create account</button>
      </form>
      {users.isPending ? (
        <p>Loading accounts…</p>
      ) : users.isError ? (
        <p role="alert">{users.error.message}</p>
      ) : (
        users.data.users.map((account) => (
          <article key={`${account.id}-${account.role}-${account.disabled}`}>
            <h3>
              {account.email}
              {account.id === user.id ? " (you)" : ""}
            </h3>
            <p>
              {account.role} · {account.disabled ? "Disabled" : "Enabled"}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                if (
                  window.confirm(
                    `Change access for ${account.email}? Existing sessions will end.`,
                  )
                )
                  void mutate(`/admin/users/${account.id}/access`, {
                    role: data.get("role"),
                    disabled: data.get("disabled") === "on",
                  });
              }}
            >
              <label>
                Account role
                <select name="role" defaultValue={account.role}>
                  <option value="viewer">Viewer</option>
                  <option value="customer">Support customer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="disabled"
                  defaultChecked={account.disabled}
                />
                Disabled
              </label>
              <button disabled={busy}>Update access</button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                if (
                  window.confirm(
                    `Reset password for ${account.email}? All their sessions will end.`,
                  )
                )
                  void mutate(`/admin/users/${account.id}/password`, {
                    password: data.get("password"),
                  }).then((ok) => {
                    if (ok) form.reset();
                  });
              }}
            >
              <label>
                Replacement password
                <input
                  type="password"
                  name="password"
                  minLength={14}
                  maxLength={1024}
                  autoComplete="new-password"
                  required
                />
              </label>
              <button disabled={busy || account.id === user.id}>
                Reset password
              </button>
              {account.id === user.id && (
                <p>Use Change my password in Account for your own password.</p>
              )}
            </form>
          </article>
        ))
      )}
      <button onClick={() => void users.refetch()}>Refresh accounts</button>
    </section>
  );
}
export function Activity() {
  const { api, user } = useSession();
  const events = useQuery({
    queryKey: ["activity"],
    queryFn: () => api<{ events: unknown[] }>("/activity"),
    refetchInterval: 30000,
    retry: false,
  });
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ events: unknown[] }>("/audit"),
    enabled: user.role === "admin",
    retry: false,
  });
  return (
    <section aria-labelledby="activity">
      <h2 id="activity">Activity</h2>
      {events.isPending ? (
        <p>Loading activity…</p>
      ) : events.isError ? (
        <p role="alert">{events.error.message}</p>
      ) : events.data.events.length ? (
        <pre>{JSON.stringify(events.data.events, null, 2)}</pre>
      ) : (
        <p>No activity recorded.</p>
      )}
      <button onClick={() => void events.refetch()}>Refresh activity</button>
      {user.role === "admin" && (
        <details>
          <summary>Administrator audit details</summary>
          {audit.isError ? (
            <p role="alert">{audit.error.message}</p>
          ) : (
            <pre>{JSON.stringify(audit.data?.events ?? [], null, 2)}</pre>
          )}
          <button onClick={() => void audit.refetch()}>Refresh events</button>
        </details>
      )}
    </section>
  );
}
