import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { endChannel, joinChannel, listChannels, startChannel } from "@/lib/walkie/service";

// The mobile app's walkie-talkie: list the channels a person can use, start or end one, and get what the app needs
// to connect to it. Who may do what is decided in lib/walkie/service.ts.
// Switched off for now: set to true to turn the walkie-talkie back on (the mobile app hides its entries with the same flag).
const WALKIE_ENABLED = true;

export async function POST(request: Request) {
  if (!WALKIE_ENABLED) return NextResponse.json({ ok: false, error: "The walkie-talkie isn't available yet." }, { status: 503 });
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });
  const user = userData.user;

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const uuid = (v: unknown) => (/^[0-9a-f-]{36}$/i.test(str(v)) ? str(v) : "");

  switch (body.action) {
    case "list":
      return NextResponse.json({ ok: true, ...(await listChannels(user.id)) });
    case "start": {
      const organizationId = uuid(body.organizationId);
      if (!organizationId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
      return NextResponse.json(await startChannel(user.id, organizationId, str(body.groupKey), str(body.name)));
    }
    case "join": {
      const channelId = uuid(body.channelId);
      if (!channelId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
      const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
      const displayName = (meta?.full_name || meta?.name || user.email?.split("@")[0] || "Team member").slice(0, 40);
      return NextResponse.json(await joinChannel(user.id, channelId, displayName));
    }
    case "end": {
      const channelId = uuid(body.channelId);
      if (!channelId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
      return NextResponse.json(await endChannel(user.id, channelId));
    }
    default:
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
}
