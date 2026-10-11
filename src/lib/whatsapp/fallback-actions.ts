"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFallbackMessage, type FallbackChannel } from "@/lib/whatsapp/fallback";

const WHATSAPP_PATH = "/dashboard/whatsapp";
const MAX_RESEND_PER_CLICK = 200;

export interface FallbackActionResult {
  error?: string;
  success?: boolean;
  sent?: number;
  failed?: number;
}

// "If WhatsApp can't deliver, send it by ...": applies automatically to
// birthday and anniversary messages and the staff digest. Campaigns are
// resent on a click instead, since that spends the church's SMS or email
// allowance in bulk.
export async function saveWhatsAppFallbackAction(channel: "none" | FallbackChannel): Promise<FallbackActionResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can change this." };
  if (!["none", "sms", "email"].includes(channel)) return { error: "That isn't a valid choice." };

  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({ whatsapp_fallback: channel }).eq("id", membership.organization.id);
  if (error) return { error: "Couldn't save that. Please try again." };

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

// Resends, by SMS or email, the people a campaign couldn't reach on WhatsApp:
// those it failed for and those skipped because WhatsApp is limiting
// marketing to them. People who opted out of WhatsApp messages are left out,
// and anyone already resent isn't sent twice.
export async function resendCampaignByFallbackAction(campaignId: string, channel: FallbackChannel): Promise<FallbackActionResult> {
  await requireUser();
  const admin = createAdminClient();
  const { data: campaign } = await admin.from("whatsapp_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) return { error: "That campaign could not be found." };

  const access = await checkTabAccess(campaign.organization_id, "whatsapp", "write");
  if (!access.ok) return { error: access.message };
  if (channel !== "sms" && channel !== "email") return { error: "Choose SMS or email." };

  const alreadySent = new Set(campaign.fallback_sent_phones ?? []);
  const candidates = new Map<string, string>();
  for (const failed of campaign.failed_recipients ?? []) if (failed.text && !alreadySent.has(failed.phone)) candidates.set(failed.phone, failed.text);
  for (const skipped of campaign.skipped_recipients ?? []) {
    if (skipped.text && !skipped.reason.startsWith("This person opted out") && !alreadySent.has(skipped.phone)) candidates.set(skipped.phone, skipped.text);
  }
  if (candidates.size === 0) return { error: "Everyone who could be resent has already been." };

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  const nowSent: string[] = [];
  for (const [phone, text] of [...candidates.entries()].slice(0, MAX_RESEND_PER_CLICK)) {
    const result = await sendFallbackMessage({ organizationId: campaign.organization_id, channel, phone, text });
    if (result.ok) {
      sent += 1;
      nowSent.push(phone);
    } else {
      failed += 1;
      firstError ??= result.error;
      // Out of allowance: the rest would fail the same way.
      if (result.error?.toLowerCase().includes("limit")) break;
    }
  }

  if (nowSent.length > 0) {
    await admin
      .from("whatsapp_campaigns")
      .update({ fallback_sent_phones: [...alreadySent, ...nowSent] })
      .eq("id", campaignId);
  }

  revalidatePath(WHATSAPP_PATH);
  if (sent === 0) return { error: firstError ?? "Nothing could be sent.", sent, failed };
  return { success: true, sent, failed, ...(failed > 0 && firstError ? { error: firstError } : {}) };
}
