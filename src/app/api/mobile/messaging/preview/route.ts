import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  parseAudience,
  resolveAudience,
  type Channel,
} from "@/lib/messaging/audience";

// How many people an audience reaches on a channel, before sending.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  const channel = body.channel as Channel;
  if (channel !== "sms" && channel !== "email" && channel !== "whatsapp") {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    channel,
    "read",
  );
  if (auth instanceof NextResponse) return auth;

  const people = await resolveAudience(
    organizationId,
    channel,
    parseAudience(body.audience),
  );
  return NextResponse.json({
    ok: true,
    count: people.length,
    sample: people.slice(0, 5).map((p) => p.name),
  });
}
