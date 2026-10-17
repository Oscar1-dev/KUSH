import { NextResponse, type NextRequest } from "next/server";

import { ApiError, kushApiBinary } from "@/lib/server/kush-api";
import { sessionToken, siteUrl } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Staff copy of a signed agreement (API checks agreements.manage + 2FA). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await sessionToken();
  if (!token) return NextResponse.redirect(siteUrl("/sign-in?next=/staff/agreements"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const { body, disposition } = await kushApiBinary(`/web/staff/agreements/${id}/pdf`, token);
    return new NextResponse(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": disposition ?? `attachment; filename="kush-agreement-${id}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.reason === "mfa_required")
      return NextResponse.redirect(siteUrl("/sign-in/verify?next=/staff/agreements"));
    const status = error instanceof ApiError ? error.status : 503;
    return new NextResponse(status === 404 ? "Not found" : status === 403 ? "Not allowed" : "Unavailable", {
      status: [403, 404].includes(status) ? status : 503,
    });
  }
}
