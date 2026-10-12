import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { requireFinancePlan } from "@/lib/finance/actions";
import { validateMembershipFeeSettings } from "@/lib/membership-fees/config";

// The staff mobile app's Membership fees settings: turn the monthly fee on, set
// the amount, due day and reminder. Same Finance plan check, same Donations tab
// permission and same rules as the web.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const auth = await requireMobileTabAccess(request, organizationId, "donations", "write");
  if (auth instanceof NextResponse) return auth;
  const planError = await requireFinancePlan(organizationId);
  if (planError) return NextResponse.json({ ok: false, error: planError });

  const enabled = body.enabled === true;
  const amountRaw = typeof body.amount === "string" ? body.amount.trim() : typeof body.amount === "number" ? String(body.amount) : "";
  const amount = amountRaw === "" ? null : Number(amountRaw);
  const dueDay = Number(body.dueDay);
  const reminderAfterDays = Number(body.reminderAfterDays);

  const errors = validateMembershipFeeSettings({ enabled, amount, dueDay, reminderAfterDays });
  const firstError = errors.amount ?? errors.dueDay ?? errors.reminderAfterDays;
  if (firstError) return NextResponse.json({ ok: false, error: firstError });

  const { error } = await createAdminClient()
    .from("membership_fee_settings")
    .upsert({ organization_id: organizationId, enabled, amount, due_day: dueDay, reminder_after_days: reminderAfterDays, updated_by: auth.userId }, { onConflict: "organization_id" });
  return NextResponse.json(error ? { ok: false, error: "Couldn't save those settings. Please try again." } : { ok: true });
}
