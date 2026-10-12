import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { endIdleMeetings } from "@/lib/kmeet/idle";
import { getSiteUrl } from "@/lib/site-url";

// The member app's "Live calls" card: the K-Connect calls (video and audio) that
// are live right now at the member's own church, with the page a member opens to
// join. Members have no direct access to these rows, so this checks the member's
// session and returns only the live ones.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });

  const { data: member } = await admin
    .from("members")
    .select("first_name, last_name, organization_id, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member || member.status !== "active") return NextResponse.json({ ok: true, calls: [] });

  await endIdleMeetings(member.organization_id);
  const { data: meetings } = await admin
    .from("kmeet_meetings")
    .select("id, title, mode, started_at")
    .eq("organization_id", member.organization_id)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(5);

  const name = `${member.first_name} ${member.last_name}`.trim();
  const base = getSiteUrl();
  return NextResponse.json({
    ok: true,
    calls: (meetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      mode: m.mode,
      joinUrl: `${base}/${m.mode === "audio" ? "kaudio" : "kmeet"}/${m.id}?name=${encodeURIComponent(name)}`,
    })),
  });
}
