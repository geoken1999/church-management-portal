import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isWhatsAppConfigured } from "@/lib/whatsapp/env";
import { getPlanUsage } from "@/lib/plans/dal";

export const getWhatsAppCampaigns = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_campaigns")
    .select("*, profiles(first_name, last_name), whatsapp_templates(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
});

// One shared platform number for everyone now (see migration 0097) — no
// more "own account unmetered" bypass, just a single monthly quota check.
export async function getWhatsAppSendAvailability(organizationId: string) {
  const usage = await getPlanUsage(organizationId);
  const available = isWhatsAppConfigured() && usage.whatsappRemaining > 0;
  return { available, whatsappRemaining: usage.whatsappRemaining };
}

export const getWhatsAppTemplates = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return data ?? [];
});

export const getApprovedWhatsAppTemplates = cache(async (organizationId: string) => {
  const templates = await getWhatsAppTemplates(organizationId);
  return templates.filter((t) => t.status === "approved");
});

// ---------------------------------------------------------------------------
// Chat — available to every org now; a conversation only ever exists for a
// phone number once it's been routed here (see whatsapp/routing.ts).
// ---------------------------------------------------------------------------

export const getWhatsAppConversations = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("*, members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false });

  return data ?? [];
});

export const getWhatsAppConversationMessages = cache(async (organizationId: string, conversationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});
