import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMetaWhatsAppEnv, isWhatsAppConfigured } from "@/lib/whatsapp/env";
import { decryptSecret } from "@/lib/whatsapp/secret-box";

// Everything a WhatsApp Graph API call needs. "platform" is the shared
// KingdomFlow number from env vars; "tenant" is a number the organization
// connected itself (organization_whatsapp_connections).
export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  appSecret: string | null;
  apiVersion: string;
  source: "platform" | "tenant";
}

export function getPlatformWhatsAppCredentials(): WhatsAppCredentials {
  const env = getMetaWhatsAppEnv();
  return { ...env, source: "platform" };
}

// The credentials to use for one organization: its own number when it has
// an active connection, otherwise the platform's. Pass no organization to
// get the platform's (platform-wide checks only). An organization whose
// connection is in an error state still resolves to its own number (and
// fails visibly) rather than silently sending from KingdomFlow's number,
// which would put the wrong sender on its messages.
export async function getWhatsAppCredentials(organizationId?: string | null): Promise<WhatsAppCredentials> {
  if (!organizationId) return getPlatformWhatsAppCredentials();

  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_whatsapp_connections")
    .select("waba_id, phone_number_id, access_token_encrypted, app_secret_encrypted, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data || data.status === "disconnected") return getPlatformWhatsAppCredentials();

  return {
    accessToken: decryptSecret(data.access_token_encrypted),
    phoneNumberId: data.phone_number_id,
    businessAccountId: data.waba_id,
    appSecret: data.app_secret_encrypted ? decryptSecret(data.app_secret_encrypted) : null,
    apiVersion: process.env.META_WHATSAPP_API_VERSION || "v21.0",
    source: "tenant",
  };
}

// Whether WhatsApp can send for this organization at all.
export async function isWhatsAppAvailableFor(organizationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("organization_whatsapp_connections").select("status").eq("organization_id", organizationId).maybeSingle();
  if (data && data.status !== "disconnected") return true;
  return isWhatsAppConfigured();
}

// What the settings page may show about a connection. Never includes the
// token or app secret; the verify token is only returned for admins, who
// need it to point their own Meta app's webhook at this platform.
export interface WhatsAppConnectionSummary {
  method: "manual" | "embedded_signup";
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "active" | "error" | "disconnected";
  lastError: string | null;
  lastCheckedAt: string | null;
  hasOwnAppSecret: boolean;
  webhookVerifyToken: string | null;
}

export async function getWhatsAppConnectionSummary(organizationId: string, isAdmin: boolean): Promise<WhatsAppConnectionSummary | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_whatsapp_connections")
    .select("connection_method, display_phone_number, verified_name, status, last_error, last_checked_at, app_secret_encrypted, webhook_verify_token")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return null;
  return {
    method: data.connection_method,
    displayPhoneNumber: data.display_phone_number,
    verifiedName: data.verified_name,
    status: data.status,
    lastError: data.last_error,
    lastCheckedAt: data.last_checked_at,
    hasOwnAppSecret: Boolean(data.app_secret_encrypted),
    webhookVerifyToken: isAdmin && data.connection_method === "manual" ? data.webhook_verify_token : null,
  };
}
