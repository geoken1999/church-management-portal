import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirrors src/lib/instagram/automation.ts's AI-mode/typing functions
// exactly, keyed by phone_number instead of participant_id — see migration
// 0096 for why.

export async function getAiMode(organizationId: string, phoneNumber: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_ai_mode")
    .select("enabled")
    .eq("organization_id", organizationId)
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  return data?.enabled ?? false;
}

export async function setAiMode(organizationId: string, phoneNumber: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("whatsapp_ai_mode")
    .upsert(
      { organization_id: organizationId, phone_number: phoneNumber, enabled },
      { onConflict: "organization_id,phone_number" },
    );
}

// Webhook-only (service client — an inbound Twilio POST carries no user
// session for is_org_member() to evaluate).
export async function getAiModeForWebhook(organizationId: string, phoneNumber: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("whatsapp_ai_mode")
    .select("enabled")
    .eq("organization_id", organizationId)
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  return data?.enabled ?? false;
}

const TYPING_STALE_MS = 25_000;

export async function getAiTypingState(organizationId: string, phoneNumber: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_ai_mode")
    .select("is_typing, typing_started_at")
    .eq("organization_id", organizationId)
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (!data?.is_typing || !data.typing_started_at) return false;
  return Date.now() - new Date(data.typing_started_at).getTime() < TYPING_STALE_MS;
}

export async function setAiTypingForWebhook(organizationId: string, phoneNumber: string, typing: boolean): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("whatsapp_ai_mode")
    .update({ is_typing: typing, typing_started_at: typing ? new Date().toISOString() : null })
    .eq("organization_id", organizationId)
    .eq("phone_number", phoneNumber);
}
