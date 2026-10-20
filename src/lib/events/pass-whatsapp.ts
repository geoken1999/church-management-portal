import "server-only";

import { logOutboundMessages, senderKeyFor } from "@/lib/whatsapp/message-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import {
  getWhatsAppCredentials,
  type WhatsAppCredentials,
} from "@/lib/whatsapp/credentials";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import {
  createMetaTemplate,
  fetchMetaTemplateStatus,
  findMetaTemplateByName,
} from "@/lib/whatsapp/templates-client";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import {
  normalizePhoneNumber,
  resolvePhoneCountry,
} from "@/lib/whatsapp/validation";
import { checkWhatsAppQuota } from "@/lib/plans/dal";
import {
  formatInTimezone,
  DEFAULT_TIMEZONE,
} from "@/lib/organizations/timezone";
import { getSiteUrl } from "@/lib/site-url";
import { pickWhatsAppNumber } from "@/lib/events/pass-whatsapp-number";
import type {
  EventRegistrationField,
  WhatsAppTemplateButton,
} from "@/types/database";

// The WhatsApp pass is a short confirmation message with a "View pass"
// button that opens the registrant's pass page (/pass/{token}), which shows
// their QR code. A text-only UTILITY template: an earlier version that put
// the QR in an image header was rejected by WhatsApp as INCORRECT_CATEGORY
// in both the Utility and Marketing categories, while plain transactional
// text with a link is the shape WhatsApp approves as Utility.
//
// One template per WhatsApp account, created automatically the first time an
// event turns the WhatsApp pass on. The name is reserved: nothing else uses
// the "event_registration_pass" prefix (the campaign composer hides it).
//
// The confirmation code is deliberately NOT in the message text: "Your
// confirmation code is X" reads as a one-time-code (Authentication) message
// to WhatsApp's classifier, which refused it with INCORRECT_CATEGORY under
// both Utility and Marketing. The code is shown on the pass page instead.
export const PASS_TEMPLATE_NAME = "event_registration_pass_ready";
const PASS_TEMPLATE_BODY =
  "Hi {{1}}, your registration for {{2}} on {{3}} is confirmed. Tap the button below to view your pass for check-in.";
const PASS_TEMPLATE_EXAMPLES = [
  "Ann",
  "Sunday Service",
  "Sat, 21 Nov 2026, 9:00 AM",
];
// Rejected earlier versions, cleaned out of the Templates list.
const LEGACY_PASS_TEMPLATE_NAMES = [
  "event_registration_pass",
  "event_registration_pass_v2",
  "event_registration_pass_link",
];

export function passButtons(siteUrl: string): WhatsAppTemplateButton[] {
  return [{ type: "url", text: "View pass", url: `${siteUrl}/pass/{{1}}` }];
}

export interface PassTemplateState {
  status: "approved" | "pending_review" | "rejected" | "error";
  message?: string;
}

// Makes sure this church's WhatsApp account has the pass template, and
// refreshes its approval status. Approval is Meta's, and can take minutes
// to hours, so a pass sent before then is skipped (and the email still
// goes). Safe to call repeatedly.
export async function ensurePassTemplate(
  organizationId: string,
  credentials?: WhatsAppCredentials,
): Promise<PassTemplateState> {
  const admin = createAdminClient();
  const creds = credentials ?? (await getWhatsAppCredentials(organizationId));

  await admin
    .from("whatsapp_templates")
    .delete()
    .eq("organization_id", organizationId)
    .in("name", LEGACY_PASS_TEMPLATE_NAMES)
    .eq("status", "rejected");

  const { data: existing } = await admin
    .from("whatsapp_templates")
    .select("id, status, meta_template_id")
    .eq("organization_id", organizationId)
    .eq("name", PASS_TEMPLATE_NAME)
    .maybeSingle();

  if (existing) {
    if (existing.status === "approved") return { status: "approved" };
    if (existing.meta_template_id) {
      try {
        const { status, rejectedReason } = await fetchMetaTemplateStatus(
          existing.meta_template_id,
          creds,
        );
        await admin
          .from("whatsapp_templates")
          .update({ status, rejected_reason: rejectedReason })
          .eq("id", existing.id);
        if (status === "approved") return { status: "approved" };
        if (status === "rejected")
          return { status: "rejected", message: rejectedReason ?? undefined };
      } catch {
        // Fall through to "still pending".
      }
    }
    return { status: "pending_review" };
  }

  // The button's address is fixed inside the template, so it must be the
  // live https site, not localhost or a preview URL.
  const siteUrl = getSiteUrl();
  if (!siteUrl.startsWith("https://")) {
    return {
      status: "error",
      message:
        "The WhatsApp pass needs the live https site address (set NEXT_PUBLIC_SITE_URL).",
    };
  }
  const buttons = passButtons(siteUrl);

  try {
    // Churches on the shared WhatsApp number share one account, where a
    // template name can exist only once. If another church already created
    // this one, use it (nothing in it is specific to a church) instead of
    // failing on the duplicate name.
    const onMeta = await findMetaTemplateByName(
      PASS_TEMPLATE_NAME,
      "en_US",
      creds,
    );
    const created = onMeta
      ? {
          metaTemplateId: onMeta.metaTemplateId,
          status: onMeta.status,
          rejectedReason: onMeta.rejectedReason,
        }
      : {
          ...(await createMetaTemplate({
            name: PASS_TEMPLATE_NAME,
            language: "en_US",
            category: "utility",
            bodyText: PASS_TEMPLATE_BODY,
            exampleValues: PASS_TEMPLATE_EXAMPLES,
            buttons,
            credentials: creds,
          })),
          rejectedReason: null as string | null,
        };

    await admin.from("whatsapp_templates").insert({
      organization_id: organizationId,
      name: PASS_TEMPLATE_NAME,
      language: "en_US",
      category: "utility",
      body_text: PASS_TEMPLATE_BODY,
      variable_count: 3,
      header_type: "none",
      header_image_path: null,
      buttons,
      meta_template_id: created.metaTemplateId,
      status: created.status,
      rejected_reason: created.rejectedReason,
    });
    if (created.status === "approved") return { status: "approved" };
    if (created.status === "rejected")
      return {
        status: "rejected",
        message: created.rejectedReason ?? undefined,
      };
    return { status: "pending_review" };
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_template",
      message: `Event pass template create failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
      metadata: { code: detail.code, type: detail.type },
    });
    return { status: "error", message: detail.message };
  }
}

// Sends one registrant's pass on WhatsApp, if the event has that turned on.
// Best-effort and never throws: it runs after the registration (and the
// email) are already done, so a failure here is logged, not surfaced.
export async function sendPassWhatsAppForRegistration(
  registrationId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: registration } = await admin
      .from("event_registrations")
      .select(
        "answers, phone, confirmation_code, pass_token, organization_id, events(title, start_at, branch_id, registration_pass_whatsapp, registration_fields, organizations(name, timezone, country))",
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (!registration) return;

    const event = registration.events as {
      title: string;
      start_at: string;
      branch_id: string | null;
      registration_pass_whatsapp: boolean;
      registration_fields: EventRegistrationField[] | null;
      organizations: {
        name: string;
        timezone: string;
        country: string | null;
      } | null;
    } | null;
    if (!event?.registration_pass_whatsapp) return;

    const organizationId = registration.organization_id;
    const answers = (registration.answers ?? {}) as Record<string, unknown>;

    const rawNumber = pickWhatsAppNumber(
      answers,
      event.registration_fields ?? [],
      registration.phone,
    );
    if (!rawNumber) return;
    let branchCountry: string | null = null;
    if (event.branch_id) {
      const { data: branch } = await admin
        .from("branches")
        .select("country")
        .eq("id", event.branch_id)
        .maybeSingle();
      branchCountry = branch?.country ?? null;
    }
    const phone = normalizePhoneNumber(
      rawNumber,
      resolvePhoneCountry(branchCountry, event.organizations?.country),
    );
    if (!phone) return;

    const credentials = await getWhatsAppCredentials(organizationId);
    const template = await ensurePassTemplate(organizationId, credentials);
    if (template.status !== "approved") return; // not approved yet; the email already went out

    const quotaError = await checkWhatsAppQuota(organizationId, 1);
    if (quotaError) return; // logged by checkWhatsAppQuota

    const name =
      typeof answers.name === "string" && answers.name.trim()
        ? answers.name.trim()
        : "there";
    const startLabel = formatInTimezone(
      event.start_at,
      event.organizations?.timezone || DEFAULT_TIMEZONE,
      { dateStyle: "medium", timeStyle: "short" },
      "en-IN",
    );

    let failure: string | null = null;
    try {
      const sent = await sendTemplateMessage({
        to: phone,
        templateName: PASS_TEMPLATE_NAME,
        languageCode: "en_US",
        bodyParams: [name, event.title, startLabel],
        buttonUrlParam: registration.pass_token,
        credentials,
      });
      await logOutboundMessages([
        {
          organizationId,
          kind: "event_pass",
          refId: null,
          recipient: phone,
          wamid: sent.id,
          templateName: PASS_TEMPLATE_NAME,
          category: "utility",
          senderKey: senderKeyFor(credentials),
        },
      ]);
    } catch (err) {
      failure = describeWhatsAppError(err).message;
      await logPlatformEvent({
        level: "warning",
        source: "whatsapp_send",
        message: `Event pass WhatsApp send failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId,
        metadata: { registrationId },
      });
    }

    // Counted like any other WhatsApp send, so the church's monthly usage
    // is right.
    await admin.from("whatsapp_campaigns").insert({
      organization_id: organizationId,
      mode: "shared",
      body: `Event pass: ${event.title}`,
      recipient_count: 1,
      sent_count: failure ? 0 : 1,
      failed_count: failure ? 1 : 0,
      failed_recipients: failure ? [{ phone, error: failure }] : [],
      status: failure ? "failed" : "sent",
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_send",
      message: `Event pass WhatsApp failed: ${err instanceof Error ? err.message : "unknown error"}`,
      metadata: { registrationId },
    });
  }
}
