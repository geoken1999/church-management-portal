import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  parseAudience,
  resolveAudience,
  type Channel,
} from "@/lib/messaging/audience";
import { plainTextToHtml } from "@/lib/messaging/plain-to-html";
import { sendSmsCampaign } from "@/lib/sms/send";
import { sendEmailCampaign } from "@/lib/email/send";
import { sendWhatsAppCampaign } from "@/lib/whatsapp/send-campaign";

// Sends an Email, SMS or WhatsApp campaign from the staff app. The same sending
// rules as the web pages (quotas, WhatsApp templates and opt-outs, the shared
// number's limits), because both use the same sending code; the audience is
// worked out here on the server from the branch / group / people chosen.
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
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const organizationId = text("organizationId");
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
    "write",
  );
  if (auth instanceof NextResponse) return auth;

  const people = await resolveAudience(
    organizationId,
    channel,
    parseAudience(body.audience),
  );
  if (people.length === 0) {
    return NextResponse.json({
      ok: false,
      error:
        channel === "email"
          ? "Nobody in that audience has an email address."
          : "Nobody in that audience has a phone number.",
    });
  }

  const admin = createAdminClient();

  if (channel === "sms") {
    const result = await sendSmsCampaign({
      organizationId,
      userId: auth.userId,
      body: text("body"),
      rawRecipients: people.map((p) => ({
        phone: p.phone,
        countryCode: p.countryCode,
      })),
    });
    return NextResponse.json(
      result.error
        ? { ok: false, error: result.error }
        : { ok: true, sent: result.sentCount, failed: result.failedCount },
    );
  }

  if (channel === "email") {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    const { data: userData } = await admin.auth.admin.getUserById(auth.userId);
    const result = await sendEmailCampaign({
      organizationId,
      organizationName: org?.name ?? "Your church",
      userId: auth.userId,
      userEmail: userData.user?.email ?? null,
      subject: text("subject"),
      html: plainTextToHtml(text("body")),
      rawRecipients: people.map((p) => p.email),
    });
    return NextResponse.json(
      result.error
        ? { ok: false, error: result.error }
        : { ok: true, sent: result.sentCount, failed: result.failedCount },
    );
  }

  const result = await sendWhatsAppCampaign({
    organizationId,
    userId: auth.userId,
    templateId: text("templateId"),
    specsInput: body.placeholderSpecs ?? [],
    rawRecipients: people.map((p) => ({
      phone: p.phone,
      countryCode: p.countryCode,
      memberId: p.id,
    })),
  });
  return NextResponse.json(
    result.error
      ? { ok: false, error: result.error, skipped: result.skippedCount }
      : {
          ok: true,
          sent: result.sentCount,
          failed: result.failedCount,
          skipped: result.skippedCount,
        },
  );
}
