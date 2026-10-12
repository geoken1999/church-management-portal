import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { parseTodoEvent } from "@/lib/todos/event-input";

// To-do events (a camp, a conference) from the staff mobile app: add, rename or
// remove. Removing one keeps its to-dos, as ordinary ones.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  const organizationId = text("organizationId");
  const action = text("action");

  const auth = await requireMobileTabAccess(request, organizationId, "todos", action === "delete" ? "delete" : "write");
  if (auth instanceof NextResponse) return auth;

  const admin = createAdminClient();

  if (action === "delete") {
    const { error } = await admin.from("todo_events").delete().eq("id", text("id")).eq("organization_id", organizationId);
    return NextResponse.json(error ? { ok: false, error: "Couldn't delete that event. Please try again." } : { ok: true });
  }

  const parsed = parseTodoEvent(text("title"), text("eventDate"));
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error });

  if (action === "create") {
    const { data, error } = await admin
      .from("todo_events")
      .insert({ organization_id: organizationId, title: parsed.title, event_date: parsed.date, created_by: auth.userId })
      .select("id")
      .single();
    return NextResponse.json(error || !data ? { ok: false, error: "Couldn't add that event. Please try again." } : { ok: true, id: data.id });
  }
  if (action === "update") {
    const { error } = await admin.from("todo_events").update({ title: parsed.title, event_date: parsed.date }).eq("id", text("id")).eq("organization_id", organizationId);
    return NextResponse.json(error ? { ok: false, error: "Couldn't save those changes. Please try again." } : { ok: true });
  }
  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}
