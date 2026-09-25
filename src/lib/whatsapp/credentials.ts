import "server-only";

import { getWhatsAppEnv } from "@/lib/whatsapp/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppMode } from "@/types/database";
import type { WhatsAppCredentials } from "@/lib/whatsapp/client";

// 'shared' always uses the platform's own account (TWILIO_ACCOUNT_SID/
// AUTH_TOKEN + TWILIO_WHATSAPP_FROM_NUMBER). 'own' looks up the
// organization's own stored credentials — same resolution shape as
// getGivingCredentials (src/lib/finance/razorpay-giving.ts).
export async function resolveWhatsAppCredentials(organizationId: string, mode: WhatsAppMode): Promise<WhatsAppCredentials | null> {
  if (mode === "shared") {
    const { accountSid, authToken, fromNumber } = getWhatsAppEnv();
    return { accountSid, authToken, fromNumber };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_whatsapp_accounts")
    .select("account_sid, auth_token, whatsapp_number")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  return { accountSid: data.account_sid, authToken: data.auth_token, fromNumber: data.whatsapp_number };
}
