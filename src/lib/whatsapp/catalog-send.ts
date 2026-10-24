import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppRemainingForBackground } from "@/lib/plans/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { friendlyDeliveryReason, isMarketingCategory } from "@/lib/whatsapp/contact-health";
import { getWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { logOutboundMessages, senderKeyFor, findBlockedRecipients } from "@/lib/whatsapp/message-log";
import { checkMarketingAllowed } from "@/lib/whatsapp/reputation";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import { catalogEntry } from "@/lib/whatsapp/platform-templates";
import { renderTemplateText } from "@/lib/whatsapp/template-render";
import { normalizePhoneNumber, resolvePhoneCountry } from "@/lib/whatsapp/validation";
import type { WhatsAppNoticeKind } from "@/types/database";

export type NoticeOutcome = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

// Sends one of KingdomFlow's own catalog templates (a fee request, a follow-up note) to one
// person on WhatsApp, for something the system does by itself. It follows the same rules as
// a campaign: the church must have the approved template, the person must not have opted out
// or be one WhatsApp is limiting, the plan's WhatsApp allowance applies, and a message is
// never sent twice for the same thing (kind + ref + number).
export async function sendCatalogNotice(input: {
  organizationId: string;
  catalogKey: string;
  kind: WhatsAppNoticeKind;
  refId: string;
  // The number as stored; the church's (or the person's branch) country fills in a missing code.
  rawPhone: string | null | undefined;
  branchCountry?: string | null;
  orgCountry?: string | null;
  memberId?: string | null;
  bodyParams: string[];
  // Fills the {{1}} of the template's link button (e.g. a feedback token), when it has one.
  buttonUrlParam?: string;
}): Promise<NoticeOutcome> {
  const { organizationId } = input;
  const definition = catalogEntry(input.catalogKey);
  if (!definition) return { status: "skipped", reason: "Unknown template." };

  const phone = input.rawPhone ? normalizePhoneNumber(input.rawPhone, resolvePhoneCountry(input.branchCountry, input.orgCountry)) : null;
  if (!phone) return { status: "skipped", reason: "No usable phone number." };

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("whatsapp_templates")
    .select("name, language, category, body_text, status")
    .eq("organization_id", organizationId)
    .eq("name", definition.name)
    .eq("status", "approved")
    .maybeSingle();
  // Not set up yet for this church (WhatsApp hasn't approved it, or it isn't added to their own
  // number): nothing is sent and nothing is recorded, so it goes out once the template is there.
  if (!template) return { status: "skipped", reason: "The WhatsApp template isn't approved for this church yet." };

  const credentials = await getWhatsAppCredentials(organizationId);
  const senderKey = senderKeyFor(credentials);
  const marketing = isMarketingCategory(template.category);

  if (marketing) {
    if (input.memberId) {
      const { data: member } = await admin.from("members").select("whatsapp_opt_in").eq("id", input.memberId).maybeSingle();
      if (member?.whatsapp_opt_in === false) return { status: "skipped", reason: "This person opted out of WhatsApp messages." };
    }
    if (credentials.source === "platform") {
      const paused = await checkMarketingAllowed(organizationId);
      if (paused) return { status: "skipped", reason: paused };
    }
    if ((await findBlockedRecipients(senderKey, [phone])).has(phone)) return { status: "skipped", reason: friendlyDeliveryReason("131049") };
  }

  // Reserve first: the unique key is what stops a second send for the same thing.
  const { data: reserved, error: reserveError } = await admin
    .from("whatsapp_notice_log")
    .insert({ organization_id: organizationId, kind: input.kind, ref_id: input.refId, recipient: phone, status: "sent" })
    .select("id")
    .single();
  if (reserveError || !reserved) {
    // 23505 is the unique key: this exact message was already sent. Anything else is a real problem.
    if (reserveError?.code === "23505") return { status: "skipped", reason: "Already sent." };
    await logPlatformEvent({ level: "error", source: "whatsapp_send", message: `WhatsApp ${input.kind} couldn't be recorded, so it wasn't sent: ${reserveError?.message ?? "no row"}`, organizationId });
    return { status: "failed", reason: "Couldn't record the message, so it wasn't sent." };
  }

  // The daily jobs have no signed-in user, so the allowance is read without one. The reserved
  // row above isn't counted yet, so one left means this message may go.
  if ((await getWhatsAppRemainingForBackground(organizationId)) < 1) {
    await admin.from("whatsapp_notice_log").delete().eq("id", reserved.id);
    return { status: "skipped", reason: "The church's WhatsApp allowance for this month is used up." };
  }

  try {
    const { id } = await sendTemplateMessage({ to: phone, templateName: template.name, languageCode: template.language, bodyParams: input.bodyParams, buttonUrlParam: input.buttonUrlParam, credentials });
    await admin.from("whatsapp_notice_log").update({ wamid: id }).eq("id", reserved.id);
    await logOutboundMessages([
      { organizationId, kind: "automation", refId: reserved.id, recipient: phone, wamid: id, templateName: template.name, category: template.category, senderKey, bodyText: renderTemplateText(template.body_text, input.bodyParams) },
    ]);
    return { status: "sent" };
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await admin.from("whatsapp_notice_log").update({ status: "failed", error: detail.message }).eq("id", reserved.id);
    await logPlatformEvent({ level: "warning", source: "whatsapp_send", message: `WhatsApp ${input.kind} not sent: ${detail.message}`, organizationId, metadata: { refId: input.refId, code: detail.code } });
    return { status: "failed", reason: detail.message };
  }
}
