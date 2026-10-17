import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { GROUPS, type Channel } from "@/lib/messaging/audience";
import { getPlanUsage } from "@/lib/plans/dal";
import { isSmsAvailable } from "@/lib/sms/dal";
import { isEmailAvailable, getEmailSmtpSettings } from "@/lib/email/dal";
import { getWhatsAppSendAvailability } from "@/lib/whatsapp/dal";

// What the staff app's message composer needs for Email, SMS or WhatsApp: the
// branches and people groups it can aim at, whether sending is available (and
// how many are left this month), and for WhatsApp the approved templates.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const channel = url.searchParams.get("channel") as Channel;
  if (channel !== "sms" && channel !== "email" && channel !== "whatsapp") {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const read = await requireMobileTabAccess(
    request,
    organizationId,
    channel,
    "read",
  );
  if (read instanceof NextResponse) return read;
  const write = await requireMobileTabAccess(
    request,
    organizationId,
    channel,
    "write",
  );
  const canSend = !(write instanceof NextResponse);

  const admin = createAdminClient();
  const [{ data: branches }, groupCounts, usage] = await Promise.all([
    admin
      .from("branches")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    Promise.all(
      GROUPS.map(async (group) => {
        const { data } = await admin
          .from(group.table)
          .select("member_id")
          .eq("organization_id", organizationId);
        return {
          key: group.key,
          label: group.label,
          count: new Set((data ?? []).map((row) => row.member_id as string))
            .size,
        };
      }),
    ),
    getPlanUsage(organizationId),
  ]);

  let available = false;
  let remaining: number | null = null;
  let unavailableMessage: string | null = null;
  if (channel === "sms") {
    available = await isSmsAvailable(organizationId);
    remaining = usage.smsRemaining;
    if (!available)
      unavailableMessage =
        remaining <= 0
          ? "You've used this month's SMS allowance. Buy an add-on pack on the web, or wait for next month."
          : "SMS isn't set up on this server yet.";
  } else if (channel === "email") {
    available = await isEmailAvailable(organizationId);
    const ownSmtp = Boolean(await getEmailSmtpSettings(organizationId));
    remaining = ownSmtp ? null : usage.emailsRemaining;
    if (!available)
      unavailableMessage =
        "Email isn't available right now: this month's allowance is used up, or email isn't set up on this server.";
  } else {
    const whatsapp = await getWhatsAppSendAvailability(organizationId);
    available = whatsapp.available;
    remaining = whatsapp.whatsappRemaining;
    if (!available)
      unavailableMessage =
        "WhatsApp isn't available right now: this month's allowance is used up, or the number isn't connected.";
  }

  let templates: {
    id: string;
    name: string;
    bodyText: string;
    variableCount: number;
    category: string;
  }[] = [];
  if (channel === "whatsapp") {
    const { data } = await admin
      .from("whatsapp_templates")
      .select("id, name, body_text, variable_count, category, status")
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    // The event-pass template needs a per-person header image, so it can't be used here.
    templates = (data ?? [])
      .filter((t) => !t.name.startsWith("event_registration_pass"))
      .map((t) => ({
        id: t.id,
        name: t.name,
        bodyText: t.body_text,
        variableCount: t.variable_count,
        category: t.category,
      }));
  }

  return NextResponse.json({
    ok: true,
    canSend,
    available,
    remaining,
    unavailableMessage,
    branches: branches ?? [],
    groups: groupCounts.filter((g) => g.count > 0),
    templates,
  });
}
