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

// The same message with the venue, map link and contact added. Sent instead of the one above only when the event
// has a map link; an event without one sends just the pass. (A template's variables are fixed, so this is a
// second template, created and approved the same way.)
export const PASS_DETAILS_TEMPLATE_NAME = "event_registration_pass_details";
const PASS_DETAILS_TEMPLATE_BODY =
  "Hi {{1}}, your registration for {{2}} on {{3}} is confirmed. Venue: {{4}}. Map: {{5}}. Contact: {{6}}. Tap the button below to view your pass for check-in.";
const PASS_DETAILS_TEMPLATE_EXAMPLES = [
  ...PASS_TEMPLATE_EXAMPLES,
  "Grace Church, Andheri",
  "https://maps.app.goo.gl/example",
  "Ann, +91 98765 43210",
];

type PassVariant = "basic" | "details";
const VARIANTS = {
  basic: { name: PASS_TEMPLATE_NAME, body: PASS_TEMPLATE_BODY, examples: PASS_TEMPLATE_EXAMPLES, variables: 3 },
  details: { name: PASS_DETAILS_TEMPLATE_NAME, body: PASS_DETAILS_TEMPLATE_BODY, examples: PASS_DETAILS_TEMPLATE_EXAMPLES, variables: 6 },
} as const;
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
  variant: PassVariant = "basic",
): Promise<PassTemplateState> {
  const template = VARIANTS[variant];
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
    .eq("name", template.name)
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
      template.name,
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
            name: template.name,
            language: "en_US",
            category: "utility",
            bodyText: template.body,
            exampleValues: [...template.examples],
            buttons,
            credentials: creds,
          })),
          rejectedReason: null as string | null,
        };

    await admin.from("whatsapp_templates").insert({
      organization_id: organizationId,
      name: template.name,
      language: "en_US",
      category: "utility",
      body_text: template.body,
      variable_count: template.variables,
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
        "answers, phone, confirmation_code, pass_token, organization_id, events(title, start_at, branch_id, venue, map_link, contact_name, contact_phone, branches(name), registration_pass_whatsapp, registration_fields, organizations(name, timezone, country))",
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (!registration) return;

    const event = registration.events as {
      title: string;
      start_at: string;
      branch_id: string | null;
      venue: string | null;
      map_link: string | null;
      contact_name: string | null;
      contact_phone: string | null;
      branches: { name: string } | null;
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
    // With a map link, the message carries the venue, map and contact; without one, just the pass. If the details
    // message isn't approved yet, fall back to the plain pass rather than sending nothing.
    const mapLink = event.map_link?.trim() ?? "";
    let variant: PassVariant = "basic";
    if (mapLink) {
      const details = await ensurePassTemplate(organizationId, credentials, "details");
      if (details.status === "approved") variant = "details";
    }
    const template = await ensurePassTemplate(organizationId, credentials, "basic");
    if (variant === "basic" && template.status !== "approved") return; // not approved yet; the email already went out

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

    const contact = [event.contact_name?.trim(), event.contact_phone?.trim()].filter(Boolean).join(", ");
    const templateName = VARIANTS[variant].name;
    const bodyParams =
      variant === "details"
        ? [name, event.title, startLabel, event.venue?.trim() || event.branches?.name || "See the map", mapLink, contact || "Not provided"]
        : [name, event.title, startLabel];

    let failure: string | null = null;
    try {
      const sent = await sendTemplateMessage({
        to: phone,
        templateName,
        languageCode: "en_US",
        bodyParams,
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
          templateName,
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
