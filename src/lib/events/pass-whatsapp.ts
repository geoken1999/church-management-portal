import "server-only";

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getWhatsAppCredentials, type WhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { sendTemplateMessage, uploadWhatsAppMedia } from "@/lib/whatsapp/client";
import { createMetaTemplate, fetchMetaTemplateStatus, uploadTemplateHeaderSample } from "@/lib/whatsapp/templates-client";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { normalizePhoneNumber, resolvePhoneCountry } from "@/lib/whatsapp/validation";
import { checkWhatsAppQuota } from "@/lib/plans/dal";
import { buildQrPng } from "@/lib/events/registration-pass";
import { formatInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { pickWhatsAppNumber } from "@/lib/events/pass-whatsapp-number";
import type { EventRegistrationField } from "@/types/database";

// One template per church WhatsApp account, created automatically the
// first time an event turns the WhatsApp pass on. The header is the pass
// (its QR code) as an image, so it is different for every message; the body
// carries the details as text, which is why none of it is drawn into the
// image (no fonts to depend on, and it stays readable and searchable).
export const PASS_TEMPLATE_NAME = "event_registration_pass";
const PASS_TEMPLATE_BODY = "Hi {{1}}, you're registered for {{2}} on {{3}}. Your confirmation code is {{4}}. Show the QR code above at check-in.";
const PASS_TEMPLATE_EXAMPLES = ["Ann", "Sunday Service", "Sat, 21 Nov 2026, 9:00 AM", "EVT-7K3Q9A"];

// A square pass: the QR on white between two bands of the event's pass
// colour. Text-free on purpose (see above).
export async function buildPassImagePng(code: string, passColor: string, organizationId: string): Promise<Buffer> {
  const color = /^#[0-9a-f]{6}$/i.test(passColor) ? passColor : "#7c3aed";
  const size = 800;
  const band = 96;
  const qrSize = 560;
  const qr = await buildQrPng(code, organizationId, qrSize);
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#ffffff"/><rect width="${size}" height="${band}" fill="${color}"/><rect y="${size - band}" width="${size}" height="${band}" fill="${color}"/></svg>`,
  );
  return sharp(background)
    .composite([{ input: qr, left: Math.round((size - qrSize) / 2), top: Math.round((size - qrSize) / 2) }])
    .png()
    .toBuffer();
}

export interface PassTemplateState {
  status: "approved" | "pending_review" | "rejected" | "error";
  message?: string;
}

// Makes sure this church's WhatsApp account has the pass template, and
// refreshes its approval status. Approval is Meta's, and can take minutes
// to hours, so a pass sent before then is skipped (and the email still
// goes). Safe to call repeatedly.
export async function ensurePassTemplate(organizationId: string, credentials?: WhatsAppCredentials, passColor = "#7c3aed"): Promise<PassTemplateState> {
  const admin = createAdminClient();
  const creds = credentials ?? (await getWhatsAppCredentials(organizationId));

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
        const { status, rejectedReason } = await fetchMetaTemplateStatus(existing.meta_template_id, creds);
        await admin.from("whatsapp_templates").update({ status, rejected_reason: rejectedReason }).eq("id", existing.id);
        if (status === "approved") return { status: "approved" };
        if (status === "rejected") return { status: "rejected", message: rejectedReason ?? undefined };
      } catch {
        // Fall through to "still pending".
      }
    }
    return { status: "pending_review" };
  }

  try {
    const sample = await buildPassImagePng("EVT-SAMPLE", passColor, organizationId);
    const headerHandle = await uploadTemplateHeaderSample({ bytes: sample, mime: "image/png", fileName: "pass.png", credentials: creds });
    const result = await createMetaTemplate({
      name: PASS_TEMPLATE_NAME,
      language: "en_US",
      category: "utility",
      bodyText: PASS_TEMPLATE_BODY,
      exampleValues: PASS_TEMPLATE_EXAMPLES,
      headerHandle,
      credentials: creds,
    });
    await admin.from("whatsapp_templates").insert({
      organization_id: organizationId,
      name: PASS_TEMPLATE_NAME,
      language: "en_US",
      category: "utility",
      body_text: PASS_TEMPLATE_BODY,
      variable_count: 4,
      header_type: "image",
      header_image_path: null,
      buttons: [],
      meta_template_id: result.metaTemplateId,
      status: result.status,
    });
    return { status: result.status === "approved" ? "approved" : "pending_review" };
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
export async function sendPassWhatsAppForRegistration(registrationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: registration } = await admin
      .from("event_registrations")
      .select(
        "answers, phone, confirmation_code, organization_id, events(title, start_at, branch_id, registration_pass_whatsapp, registration_pass_color, registration_fields, organizations(name, timezone, country))",
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (!registration) return;

    const event = registration.events as {
      title: string;
      start_at: string;
      branch_id: string | null;
      registration_pass_whatsapp: boolean;
      registration_pass_color: string;
      registration_fields: EventRegistrationField[] | null;
      organizations: { name: string; timezone: string; country: string | null } | null;
    } | null;
    if (!event?.registration_pass_whatsapp) return;

    const organizationId = registration.organization_id;
    const answers = (registration.answers ?? {}) as Record<string, unknown>;

    const rawNumber = pickWhatsAppNumber(answers, event.registration_fields ?? [], registration.phone);
    if (!rawNumber) return;
    let branchCountry: string | null = null;
    if (event.branch_id) {
      const { data: branch } = await admin.from("branches").select("country").eq("id", event.branch_id).maybeSingle();
      branchCountry = branch?.country ?? null;
    }
    const phone = normalizePhoneNumber(rawNumber, resolvePhoneCountry(branchCountry, event.organizations?.country));
    if (!phone) return;

    const credentials = await getWhatsAppCredentials(organizationId);
    const template = await ensurePassTemplate(organizationId, credentials, event.registration_pass_color);
    if (template.status !== "approved") return; // not approved yet; the email already went out

    const quotaError = await checkWhatsAppQuota(organizationId, 1);
    if (quotaError) return; // logged by checkWhatsAppQuota

    const name = typeof answers.name === "string" && answers.name.trim() ? answers.name.trim() : "there";
    const startLabel = formatInTimezone(event.start_at, event.organizations?.timezone || DEFAULT_TIMEZONE, { dateStyle: "medium", timeStyle: "short" }, "en-IN");

    const image = await buildPassImagePng(registration.confirmation_code, event.registration_pass_color, organizationId);
    const mediaId = await uploadWhatsAppMedia({ bytes: image, mime: "image/png", fileName: "pass.png", credentials });

    let failure: string | null = null;
    try {
      await sendTemplateMessage({
        to: phone,
        templateName: PASS_TEMPLATE_NAME,
        languageCode: "en_US",
        bodyParams: [name, event.title, startLabel, registration.confirmation_code],
        headerImageMediaId: mediaId,
        credentials,
      });
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
