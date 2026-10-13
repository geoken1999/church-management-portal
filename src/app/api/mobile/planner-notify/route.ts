import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { notifyMember } from "@/lib/push/member-notice";

// The staff app saves a planner task's assignee straight to the plan, so this is
// how the person it was assigned to is told (a push notification, and an entry in
// their notification center), the same message the web sends. Needs Write access
// to the Planner tab.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const organizationId = text("organizationId");
  const auth = await requireMobileTabAccess(request, organizationId, "planner", "write");
  if (auth instanceof NextResponse) return auth;

  const planId = text("planId");
  const memberId = text("memberId");
  const taskText = text("taskText").slice(0, 200);
  if (!planId || !memberId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: plan }, { data: member }] = await Promise.all([
    admin.from("plans").select("title").eq("id", planId).eq("organization_id", organizationId).maybeSingle(),
    admin.from("members").select("id").eq("id", memberId).eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (!plan || !member) return NextResponse.json({ ok: false, error: "That task or person could not be found." }, { status: 404 });

  await notifyMember(memberId, "New task assigned to you", `${taskText}${plan.title ? ` (${plan.title})` : ""}`);
  return NextResponse.json({ ok: true });
}
