import { NextResponse } from "next/server";
import { requireMobileAdmin } from "@/lib/mobile/staff-auth";
import { getGivingConfig, saveGivingConfig } from "@/lib/finance/giving-config";

// The staff mobile app's Configuration > Giving: read and change how the church
// takes online gifts (which gateway, and which kinds of gift).
export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ ok: true, ...(await getGivingConfig(organizationId)) });
}

export async function POST(request: Request) {
  let body: { organizationId?: unknown; enabled?: unknown; mode?: unknown; types?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;

  const result = await saveGivingConfig(organizationId, { enabled: body.enabled === true, mode: typeof body.mode === "string" ? body.mode : null, types: body.types });
  if ("error" in result) return NextResponse.json({ ok: false, error: result.error });
  return NextResponse.json({ ok: true, ...result.config });
}
