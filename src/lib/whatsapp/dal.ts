import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isWhatsAppConfigured } from "@/lib/whatsapp/env";
import { getPlanUsage } from "@/lib/plans/dal";

// Only the account_sid + whatsapp_number for display — auth_token is as
// sensitive as a password and never leaves this query.
export const getWhatsAppAccount = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_whatsapp_accounts")
    .select("account_sid, whatsapp_number, created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

export const getWhatsAppCampaigns = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_campaigns")
    .select("*, profiles(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
});

// A 'shared' send is available while the platform's Twilio WhatsApp
// number is configured and this month's quota isn't exhausted; an org's
// own connected account is always available regardless of the shared
// quota (same shape as isSmsAvailable, plus the 'own' bypass email's SMTP
// path already established).
export async function getWhatsAppSendAvailability(organizationId: string, hasOwnAccount: boolean) {
  const usage = await getPlanUsage(organizationId);
  const sharedAvailable = isWhatsAppConfigured() && usage.whatsappRemaining > 0;
  return {
    sharedAvailable,
    ownAvailable: hasOwnAccount,
    anyAvailable: sharedAvailable || hasOwnAccount,
    whatsappRemaining: usage.whatsappRemaining,
  };
}

// ---------------------------------------------------------------------------
// Chat — 'own' mode only (see migration 0058 for why)
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
