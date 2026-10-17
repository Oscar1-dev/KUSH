import { NextResponse, type NextRequest } from "next/server";

import { ApiError, kushApiBinary } from "@/lib/server/kush-api";
import { sessionToken, siteUrl } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** The signer's own PDF copy. The API checks the account owns it. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await sessionToken();
  if (!token) return NextResponse.redirect(siteUrl("/sign-in"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const { body, disposition } = await kushApiBinary(`/web/agreements/${id}/pdf`, token);
    return new NextResponse(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": disposition ?? `attachment; filename="kush-agreement-${id}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    return new NextResponse(status === 404 ? "Not found" : "Unavailable", { status: status === 404 ? 404 : status === 403 ? 403 : 503 });
  }
}
