"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, kushApi } from "@/lib/server/kush-api";
import { allow, sessionToken, visitorKey } from "@/lib/server/session";

import type { ActionState } from "./actions";

async function token() {
  const value = await sessionToken();
  if (!value) redirect("/sign-in?next=/account/applications");
  return value;
}
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const uuidOf = (form: FormData, name: string) => {
  const value = text(form, name);
  return /^[0-9a-f-]{36}$/.test(value) ? value : null;
};

function failure(error: unknown): ActionState {
  if (!(error instanceof ApiError)) throw error;
  if (error.status === 401) redirect("/sign-in?next=/account/applications");
  if (error.status === 403 && /Two-factor/.test(error.message)) redirect("/sign-in/verify?next=/account/applications");
  if (error.status === 400 && error.message === "Invalid request")
    return { error: "Please check every field. Some answers are too short or a link isn't valid." };
  return { error: error.message };
}

async function limited(name: string, max: number) {
  return !allow(`${name}:${await visitorKey()}`, max, 60_000);
}

export async function applyForStaff(_p: ActionState, form: FormData): Promise<ActionState> {
  if (await limited("apply", 5)) return { error: "Too many attempts. Wait a minute and try again." };
  let id: string;
  try {
    id = (
      await kushApi<{ application: { id: string } }>("/web/recruitment/applications", {
        method: "POST",
        token: await token(),
        body: {
          requestId: text(form, "requestId"),
          positionKey: text(form, "positionKey"),
          preferredName: text(form, "preferredName"),
          email: text(form, "email"),
          experience: text(form, "experience"),
          skills: text(form, "skills"),
          availability: text(form, "availability"),
          motivation: text(form, "motivation"),
          portfolioUrl: text(form, "portfolioUrl") || null,
        },
      })
    ).application.id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/account/applications");
  redirect(`/account/applications/${id}?new=1`);
}

export async function messageRecruiters(_p: ActionState, form: FormData): Promise<ActionState> {
  if (await limited("app-message", 15)) return { error: "Slow down a little and try again." };
  const id = uuidOf(form, "applicationId");
  if (!id) return { error: "Application not found." };
  try {
    await kushApi(`/web/recruitment/applications/${id}/messages`, {
      method: "POST",
      token: await token(),
      body: { requestId: text(form, "requestId"), content: text(form, "content") },
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/account/applications/${id}`);
  return { success: "Message sent." };
}

export async function withdrawApplication(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuidOf(form, "applicationId");
  if (!id) return { error: "Application not found." };
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  try {
    await kushApi(`/web/recruitment/applications/${id}/withdraw`, { method: "POST", token: await token() });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/account/applications/${id}`);
  return { success: "Application withdrawn." };
}

export async function signAgreement(_p: ActionState, form: FormData): Promise<ActionState> {
  if (await limited("sign", 5)) return { error: "Too many attempts. Wait a minute and try again." };
  const id = uuidOf(form, "agreementId");
  if (!id) return { error: "Agreement not found." };
  // Explicit acceptance is required here and enforced again by the API.
  if (form.get("accept") !== "on") return { error: "You must tick the acceptance box to sign." };
  const list = await headers();
  try {
    await kushApi(`/web/agreements/${id}/sign`, {
      method: "POST",
      token: await token(),
      headers: {
        "x-kush-visitor-ip": await visitorKey(),
        "x-kush-visitor-agent": (list.get("user-agent") ?? "").slice(0, 300),
      },
      body: {
        legalName: text(form, "legalName"),
        email: text(form, "email"),
        signature: text(form, "signature"),
        accept: true,
        statement: text(form, "statement"),
        bodySha256: text(form, "bodySha256"),
      },
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/account/agreements/${id}`);
  redirect(`/account/agreements/${id}?signed=1`);
}
