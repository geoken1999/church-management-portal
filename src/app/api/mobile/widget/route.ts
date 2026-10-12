import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";

// The staff mobile app's Widget: turn the website widget on or off, and work
// through what visitors sent (mark read, archive, delete), under the Widget tab
// permissions. Designing the widget stays on the web.
const STATUSES = ["new", "read", "archived"];

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
  const auth = await requireMobileTabAccess(request, organizationId, "widget", action === "delete_submission" ? "delete" : "write");
  if (auth instanceof NextResponse) return auth;
  const admin = createAdminClient();

  if (action === "toggle") {
    const { error } = await admin.from("website_widgets").update({ enabled: body.enabled === true }).eq("id", text("widgetId")).eq("organization_id", organizationId);
    return NextResponse.json(error ? { ok: false, error: "Couldn't update the widget." } : { ok: true });
  }
  if (action === "set_status") {
    if (!STATUSES.includes(text("status"))) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    const { error } = await admin.from("widget_submissions").update({ status: text("status") as "new" | "read" | "archived" }).eq("id", text("submissionId")).eq("organization_id", organizationId);
    return NextResponse.json(error ? { ok: false, error: "Couldn't update that message." } : { ok: true });
  }
  if (action === "delete_submission") {
    const { error } = await admin.from("widget_submissions").delete().eq("id", text("submissionId")).eq("organization_id", organizationId);
    return NextResponse.json(error ? { ok: false, error: "Couldn't delete that message." } : { ok: true });
  }
  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}
