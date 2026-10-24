import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getPlatformWhatsAppCredentials, getWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { createMetaTemplate, fetchMetaTemplateStatus, findMetaTemplateByName } from "@/lib/whatsapp/templates-client";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { PLATFORM_TEMPLATE_CATALOG, catalogButtons, variableCountOf, type PlatformTemplateDefinition } from "@/lib/whatsapp/platform-catalog";
import { getSiteUrl } from "@/lib/site-url";
import type { PlatformWhatsAppTemplate } from "@/types/database";

// The buttons a church's copy of a platform template carries (the same as the master was submitted with).
function buttonsForMaster(catalogKey: string) {
  const definition = PLATFORM_TEMPLATE_CATALOG.find((t) => t.key === catalogKey);
  return definition ? catalogButtons(definition, getSiteUrl()) : [];
}

export function catalogEntry(key: string): PlatformTemplateDefinition | undefined {
  return PLATFORM_TEMPLATE_CATALOG.find((t) => t.key === key);
}

// ---------------------------------------------------------------------------
// Platform side: submit the master templates to the platform's WhatsApp
// account (one time each), and keep their approval status current.
// ---------------------------------------------------------------------------

export async function submitPlatformTemplate(key: string): Promise<{ error?: string }> {
  const definition = catalogEntry(key);
  if (!definition) return { error: "Unknown template." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("platform_whatsapp_templates").select("id").eq("catalog_key", key).maybeSingle();
  if (existing) return { error: "That template was already submitted." };

  const credentials = getPlatformWhatsAppCredentials();
  try {
    // A name already on the account (submitted before, or by hand) is
    // adopted rather than created again, which WhatsApp would refuse.
    const onMeta = await findMetaTemplateByName(definition.name, definition.language, credentials);
    const created = onMeta ?? {
      ...(await createMetaTemplate({
        name: definition.name,
        language: definition.language,
        category: definition.category,
        bodyText: definition.body,
        exampleValues: definition.examples,
        buttons: catalogButtons(definition, getSiteUrl()),
        credentials,
      })),
      rejectedReason: null as string | null,
    };
    await admin.from("platform_whatsapp_templates").insert({
      catalog_key: key,
      name: definition.name,
      language: definition.language,
      category: definition.category,
      body_text: definition.body,
      variable_count: variableCountOf(definition.body),
      meta_template_id: created.metaTemplateId,
      status: created.status,
      rejected_reason: created.rejectedReason,
    });
    return {};
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({ level: "warning", source: "whatsapp_template", message: `Platform template ${definition.name} submit failed: ${detail.message}`, metadata: { key } });
    return { error: detail.message };
  }
}

export async function refreshPlatformTemplates(): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("platform_whatsapp_templates").select("id, meta_template_id, status").not("meta_template_id", "is", null);
  const credentials = getPlatformWhatsAppCredentials();
  for (const row of rows ?? []) {
    try {
      const { status, rejectedReason } = await fetchMetaTemplateStatus(row.meta_template_id as string, credentials);
      if (status !== row.status) await admin.from("platform_whatsapp_templates").update({ status, rejected_reason: rejectedReason }).eq("id", row.id);
    } catch {
      // Leave it as it was; the next refresh retries.
    }
  }
}

// ---------------------------------------------------------------------------
// Church side
// ---------------------------------------------------------------------------

async function usesOwnNumber(organizationId: string): Promise<boolean> {
  return (await getWhatsAppCredentials(organizationId)).source === "tenant";
}

// For a church sending from the shared KingdomFlow number: makes sure it has
// a copy of every approved platform template (so they show up in its
// campaign composer like any template it made), and that the copies' status
// follows the master. Idempotent and cheap; run when the WhatsApp page
// loads. A church with its own number is not touched: the platform's
// templates live in the platform's account, not theirs (see
// addPlatformTemplateToOwnAccount).
export async function syncPlatformTemplatesForOrg(organizationId: string): Promise<void> {
  try {
    if (await usesOwnNumber(organizationId)) return;

    const admin = createAdminClient();
    const [{ data: masters }, { data: mine }] = await Promise.all([
      admin.from("platform_whatsapp_templates").select("*").eq("status", "approved"),
      admin.from("whatsapp_templates").select("id, name, platform_template_id, status").eq("organization_id", organizationId),
    ]);
    if (!masters || masters.length === 0) return;

    const copiedMasterIds = new Set((mine ?? []).map((t) => t.platform_template_id).filter(Boolean));
    const takenNames = new Set((mine ?? []).map((t) => t.name));
    const missing = masters.filter((m) => !copiedMasterIds.has(m.id) && !takenNames.has(m.name));
    if (missing.length > 0) {
      await admin.from("whatsapp_templates").insert(
        missing.map((m: PlatformWhatsAppTemplate) => ({
          organization_id: organizationId,
          name: m.name,
          language: m.language,
          category: m.category,
          body_text: m.body_text,
          variable_count: m.variable_count,
          header_type: "none" as const,
          header_image_path: null,
          buttons: buttonsForMaster(m.catalog_key),
          platform_template_id: m.id,
          meta_template_id: m.meta_template_id,
          status: m.status,
        })),
      );
    }

    // A copy whose master is no longer approved (paused, disabled) stops
    // being sendable.
    const approvedIds = new Set(masters.map((m) => m.id));
    const stale = (mine ?? []).filter((t) => t.platform_template_id && !approvedIds.has(t.platform_template_id) && t.status === "approved");
    for (const t of stale) await admin.from("whatsapp_templates").update({ status: "paused" }).eq("id", t.id);
  } catch (err) {
    console.error("syncPlatformTemplatesForOrg failed:", err);
  }
}

// For a church with its own WhatsApp number: submits a copy of a platform
// template to THEIR account, since the platform's approved one can't be used
// from a different number. It is the same wording, so it is usually
// approved quickly, but it is still WhatsApp's decision.
export async function addPlatformTemplateToOwnAccount(organizationId: string, platformTemplateId: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: master } = await admin.from("platform_whatsapp_templates").select("*").eq("id", platformTemplateId).maybeSingle();
  if (!master) return { error: "That template could not be found." };

  const credentials = await getWhatsAppCredentials(organizationId);
  if (credentials.source !== "tenant") return { error: "Your church uses the shared KingdomFlow number, so this template is already available to you." };

  const { data: already } = await admin.from("whatsapp_templates").select("id").eq("organization_id", organizationId).eq("name", master.name).maybeSingle();
  if (already) return { error: "You already have this template." };

  const definition = PLATFORM_TEMPLATE_CATALOG.find((t) => t.key === master.catalog_key);
  if (!definition) return { error: "That template is no longer offered." };

  try {
    const onMeta = await findMetaTemplateByName(master.name, master.language, credentials);
    const created = onMeta ?? {
      ...(await createMetaTemplate({
        name: master.name,
        language: master.language,
        category: master.category,
        bodyText: master.body_text,
        exampleValues: definition.examples,
        buttons: catalogButtons(definition, getSiteUrl()),
        credentials,
      })),
      rejectedReason: null as string | null,
    };
    await admin.from("whatsapp_templates").insert({
      organization_id: organizationId,
      name: master.name,
      language: master.language,
      category: master.category,
      body_text: master.body_text,
      variable_count: master.variable_count,
      header_type: "none",
      header_image_path: null,
      buttons: catalogButtons(definition, getSiteUrl()),
      platform_template_id: master.id,
      meta_template_id: created.metaTemplateId,
      status: created.status,
      rejected_reason: created.rejectedReason,
    });
    return {};
  } catch (err) {
    return { error: describeWhatsAppError(err).message };
  }
}
