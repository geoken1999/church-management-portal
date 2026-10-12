import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";

// What the app's to-do form offers: the team members and leaders a to-do can be
// assigned to, and the to-do events it can belong to. (Team members' names live
// in profiles, which the app can't read directly.)
export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  const auth = await requireMobileTabAccess(request, organizationId, "todos", "read");
  if (auth instanceof NextResponse) return auth;

  const admin = createAdminClient();
  const [{ data: team }, { data: leaders }, { data: events }] = await Promise.all([
    admin.from("organization_members").select("auth_user_id, profiles(first_name, last_name)").eq("organization_id", organizationId),
    admin.from("leaders").select("member_id, members(first_name, last_name)").eq("organization_id", organizationId),
    admin.from("todo_events").select("id, title, event_date").eq("organization_id", organizationId).order("event_date", { ascending: true, nullsFirst: false }),
  ]);

  const name = (person: { first_name: string; last_name: string | null } | null) => `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "Unnamed";
  return NextResponse.json({
    ok: true,
    team: (team ?? []).map((row) => ({ value: `u:${row.auth_user_id}`, name: name(row.profiles as { first_name: string; last_name: string | null } | null) })),
    leaders: (leaders ?? []).map((row) => ({ value: `m:${row.member_id}`, name: name(row.members as { first_name: string; last_name: string | null } | null) })),
    events: (events ?? []).map((row) => ({ id: row.id, title: row.title, eventDate: row.event_date })),
  });
}
