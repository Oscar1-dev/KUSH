import { createContext, useContext } from "react";
import type { User } from "./api";
export type Api = <T>(path: string, options?: RequestInit) => Promise<T>;
export const SessionContext = createContext<{
  api: Api;
  user: User;
  signOut: (message?: string) => void;
} | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session required");
  return session;
}
export function payload(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation failed.";
}
