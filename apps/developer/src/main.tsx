import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import {
  API_URL,
  ENDPOINTS,
  ApiError,
  loadPolling,
  pollingInterval,
  request,
  validatedEndpoint,
  type User,
} from "./api";
import { SessionContext, payload, message } from "./session";
import { Administration, Activity } from "./Administration";
import { Delivery } from "./Delivery";
import { Support } from "./Support";
import "./style.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function App() {
  const [poll, setPoll] = useState(loadPolling);
  const [endpoint, setEndpoint] = useState(() => {
    try {
      return validatedEndpoint(localStorage.getItem("kush.endpoint"));
    } catch {
      return API_URL;
    }
  });
  const [session, setSession] = useState<{ token: string; user: User } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signOut = useCallback((reason = "") => {
    setSession(null);
    queryClient.clear();
    setError(reason);
  }, []);
  const api = useCallback(
    async <T,>(path: string, options: RequestInit = {}) => {
      try {
        return await request<T>(path, options, session?.token, endpoint);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && session)
          signOut("Your session ended. Sign in again.");
        throw e;
      }
    },
    [session, endpoint, signOut],
  );
  const health = useQuery({
    queryKey: ["health", endpoint],
    queryFn: () =>
      request<Record<string, unknown>>("/health", {}, undefined, endpoint),
    refetchInterval: poll * 1000,
  });
  const profiles = useQuery({
    queryKey: ["profiles", endpoint],
    queryFn: () =>
      api<{
        profiles: {
          id: string;
          name: string;
          endpoint: string;
          kind: string;
        }[];
      }>("/profiles"),
    enabled: !!session && session.user.role !== "customer",
  });
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      void api("/auth/me").catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [session, api]);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await request<{ token: string; user: User }>(
        "/auth/login",
        payload({ email: data.get("email"), password: data.get("password") }),
        undefined,
        endpoint,
      );
      form.reset();
      const verified = await request<{ user: User }>(
        "/auth/me",
        {},
        result.token,
        endpoint,
      );
      queryClient.clear();
      setSession({ ...result, user: verified.user });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      signOut();
    } catch {
      signOut(
        "Signed out locally. API revocation could not be confirmed; session expiry still applies.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
    try {
      await getCurrentWindow()[action]();
    } catch {
      setError("Window action failed. Check desktop logs.");
    }
  }
  function selectEndpoint(value: string) {
    if (
      session &&
      !window.confirm(
        "Change local API profile? This signs you out and discards unsaved edits.",
      )
    )
      return;
    const next = validatedEndpoint(value);
    signOut();
    setEndpoint(next);
    try {
      localStorage.setItem("kush.endpoint", next);
    } catch {
      setError("Profile preference could not be saved.");
    }
  }
  return (
    <>
      <header className="titlebar">
        <div data-tauri-drag-region className="drag">
          KUSH Developer <span>Local operations</span>
        </div>
        {isTauri() && (
          <nav aria-label="Window controls">
            <button
              aria-label="Minimize"
              onClick={() => void windowAction("minimize")}
            >
              −
            </button>
            <button
              aria-label="Maximize or restore"
              onClick={() => void windowAction("toggleMaximize")}
            >
              □
            </button>
            <button
              aria-label="Close"
              onClick={() => void windowAction("close")}
            >
              ×
            </button>
          </nav>
        )}
      </header>
      <main>
        <nav className="section-nav" aria-label="Operations sections">
          <a href="#connection">Connection</a>
          <a href="#account">Account</a>
          {session && (
            <>
              <a href="#support">Support</a>
              {session.user.role !== "customer" && (
                <>
                  <a href="#delivery">Clients and delivery</a>
                  <a href="#activity">Activity</a>
                </>
              )}
              {session.user.role === "admin" && <a href="#users">Users</a>}
            </>
          )}
        </nav>
        <h1>Operations</h1>
        <p className="muted">
          Local business administration and client delivery records.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <section aria-labelledby="connection">
          <h2 id="connection">Connection</h2>
          <p role="status" aria-live="polite">
            {health.isFetching && !health.data
              ? "Checking local API…"
              : health.isError
                ? "API unavailable"
                : health.data
                  ? "API reachable"
                  : "Not checked"}
          </p>
          <p className="muted">{endpoint}</p>
          {health.error && <p>{health.error.message}</p>}
          {health.data && <pre>{JSON.stringify(health.data, null, 2)}</pre>}
          <button
            disabled={health.isFetching}
            onClick={() => void health.refetch()}
          >
            Check now
          </button>
          <label>
            Local API endpoint
            <select
              value={endpoint}
              onChange={(e) => selectEndpoint(e.target.value)}
            >
              {ENDPOINTS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Check interval
            <select
              value={poll}
              onChange={(e) => {
                const next = pollingInterval(e.target.value);
                setPoll(next);
                try {
                  localStorage.setItem("kush.pollSeconds", String(next));
                } catch {
                  setError("Preferences could not be saved.");
                }
              }}
            >
              {[5, 10, 30, 60].map((value) => (
                <option key={value} value={value}>
                  {value} seconds
                </option>
              ))}
            </select>
          </label>
          {session && session.user.role !== "customer" && (
            <>
              <h3>Saved local profiles</h3>
              {profiles.isError ? (
                <p role="alert">{profiles.error.message}</p>
              ) : profiles.data?.profiles.length ? (
                profiles.data.profiles.map((profile) => (
                  <div className="record" key={profile.id}>
                    <p>
                      {profile.name} · {profile.endpoint}
                    </p>
                    <button onClick={() => selectEndpoint(profile.endpoint)}>
                      Use profile
                    </button>
                    {session.user.role === "admin" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete profile ${profile.name}?`))
                            void api(`/profiles/${profile.id}/delete`, {
                              method: "POST",
                            })
                              .then(() => profiles.refetch())
                              .catch((e) => setError(message(e)));
                        }}
                      >
                        Delete profile
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p>
                  No named profiles saved. Endpoint choices are restricted to
                  this computer.
                </p>
              )}
              {session.user.role === "admin" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const data = new FormData(form);
                    void api(
                      "/profiles",
                      payload({
                        name: data.get("name"),
                        endpoint: data.get("endpoint"),
                      }),
                    )
                      .then(() => {
                        form.reset();
                        return profiles.refetch();
                      })
                      .catch((e) => setError(message(e)));
                  }}
                >
                  <label>
                    Profile name
                    <input name="name" required maxLength={80} />
                  </label>
                  <label>
                    Profile endpoint
                    <select name="endpoint">
                      {ENDPOINTS.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <button>Save local profile</button>
                </form>
              )}
            </>
          )}
        </section>
        <section aria-labelledby="account">
          <h2 id="account">Account</h2>
          {session ? (
            <>
              <p>Signed in as {session.user.email}</p>
              <p>Role: {session.user.role}</p>
              <button disabled={busy} onClick={() => void logout()}>
                Sign out
              </button>
              <details>
                <summary>Change my password</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const data = new FormData(form);
                    setBusy(true);
                    void api(
                      "/auth/password",
                      payload({
                        currentPassword: data.get("currentPassword"),
                        password: data.get("password"),
                      }),
                    )
                      .then(() => {
                        form.reset();
                        signOut(
                          "Password changed. All sessions ended; sign in again.",
                        );
                      })
                      .catch((e) => setError(message(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <label>
                    Current password
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={1024}
                    />
                  </label>
                  <label>
                    New password
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={14}
                      maxLength={1024}
                    />
                  </label>
                  <button disabled={busy}>Change password and sign out</button>
                </form>
              </details>
            </>
          ) : (
            <form onSubmit={(e) => void login(e)}>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                />
              </label>
              <button disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <p className="muted">
                Use an administrator-provisioned account. Tokens remain in
                memory. Reload signs out this window; server sessions expire
                after eight hours.
              </p>
            </form>
          )}
        </section>
        {session && (
          <SessionContext.Provider value={{ api, user: session.user, signOut }}>
            <Support />
            {session.user.role !== "customer" && (
              <>
                <Delivery />
                <Activity />
              </>
            )}
            {session.user.role === "admin" && <Administration />}
          </SessionContext.Provider>
        )}
        <footer>
          Support tickets are local records. Live Discord, payments, licensing,
          supplier and infrastructure integrations remain unavailable.
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
