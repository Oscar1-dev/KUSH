import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Redeems a signed download link. The token itself is the authorisation
 * (5 minutes, bound to one person and file); the API re-checks ownership
 * and streams the file. The API is never exposed to the browser.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{60,80}$/.test(token)) return new NextResponse("Invalid link", { status: 400 });
  const secret = process.env.KUSH_WEBSITE_SECRET;
  if (!secret) return new NextResponse("Unavailable", { status: 503 });
  let response: Response;
  try {
    response = await fetch(`${process.env.KUSH_API_URL ?? "http://127.0.0.1:4310"}/web/downloads/${token}`, {
      headers: { "x-kush-website-secret": secret },
      cache: "no-store",
    });
  } catch {
    return new NextResponse("Downloads are unavailable right now", { status: 503 });
  }
  if (!response.ok || !response.body) {
    const message = response.status === 403 ? "This link has expired or you no longer have access. Get a new link from your account." : "Download unavailable";
    return new NextResponse(message, { status: response.status === 403 ? 403 : response.status === 404 ? 404 : 503 });
  }
  return new NextResponse(response.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": response.headers.get("content-disposition") ?? "attachment",
      ...(response.headers.get("content-length") ? { "content-length": response.headers.get("content-length")! } : {}),
      "x-content-sha256": response.headers.get("x-content-sha256") ?? "",
      "cache-control": "no-store",
    },
  });
}
