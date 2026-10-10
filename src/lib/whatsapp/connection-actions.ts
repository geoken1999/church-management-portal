"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { describeWhatsAppError, parseGraphError } from "@/lib/whatsapp/graph-error";
import { decryptSecret, encryptSecret, isSecretBoxConfigured } from "@/lib/whatsapp/secret-box";

const WHATSAPP_PATH = "/dashboard/whatsapp";
const API_VERSION = process.env.META_WHATSAPP_API_VERSION || "v21.0";

export interface ConnectionResult {
  error?: string;
  success?: boolean;
}

async function requireOrgAdmin() {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return null;
  return { userId: user.id, organizationId: membership.organization.id };
}

const NOT_ALLOWED: ConnectionResult = { error: "Only an owner or admin can change the WhatsApp number." };
const NOT_CONFIGURED: ConnectionResult = { error: "Connecting your own number isn't set up on this server yet. Contact support." };

async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw await parseGraphError(res);
  return (await res.json()) as T;
}

// Proves the token can actually act on this number and WABA, and reads the
// number's public details. Fails (with Meta's own explanation) for a wrong
// ID, an expired token, or a token that lacks WhatsApp permissions.
async function inspectNumber(params: { accessToken: string; phoneNumberId: string; wabaId: string }) {
  const phone = await graphGet<{ display_phone_number?: string; verified_name?: string }>(
    `${params.phoneNumberId}?fields=display_phone_number,verified_name`,
    params.accessToken,
  );
  const numbers = await graphGet<{ data?: { id: string }[] }>(`${params.wabaId}/phone_numbers?fields=id&limit=100`, params.accessToken);
  if (!numbers.data?.some((n) => n.id === params.phoneNumberId)) {
    throw new Error("That phone number doesn't belong to that WhatsApp Business Account ID.");
  }
  return { displayPhoneNumber: phone.display_phone_number ?? null, verifiedName: phone.verified_name ?? null };
}

async function saveConnection(params: {
  organizationId: string;
  userId: string;
  method: "manual" | "embedded_signup";
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string | null;
}): Promise<ConnectionResult> {
  let details;
  try {
    details = await inspectNumber(params);
  } catch (err) {
    return { error: err instanceof Error ? describeWhatsAppError(err).message : "Couldn't verify that WhatsApp number." };
  }

  const admin = createAdminClient();
  const { data: taken } = await admin.from("organization_whatsapp_connections").select("organization_id").eq("phone_number_id", params.phoneNumberId).maybeSingle();
  if (taken && taken.organization_id !== params.organizationId) {
    return { error: "That WhatsApp number is already connected to another church." };
  }

  const { error } = await admin.from("organization_whatsapp_connections").upsert(
    {
      organization_id: params.organizationId,
      connection_method: params.method,
      waba_id: params.wabaId,
      phone_number_id: params.phoneNumberId,
      display_phone_number: details.displayPhoneNumber,
      verified_name: details.verifiedName,
      access_token_encrypted: encryptSecret(params.accessToken),
      app_secret_encrypted: params.appSecret ? encryptSecret(params.appSecret) : null,
      status: "active",
      last_error: null,
      last_checked_at: new Date().toISOString(),
      connected_by: params.userId,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { error: "Couldn't save your WhatsApp connection." };

  await logPlatformEvent({
    level: "info",
    source: "whatsapp_send",
    message: `Organization connected its own WhatsApp number (${params.method})`,
    organizationId: params.organizationId,
    metadata: { phoneNumberId: params.phoneNumberId },
  });

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

const DIGITS = /^\d{5,30}$/;

export async function connectWhatsAppManuallyAction(input: { wabaId: string; phoneNumberId: string; accessToken: string; appSecret: string }): Promise<ConnectionResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;
  if (!isSecretBoxConfigured()) return NOT_CONFIGURED;

  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  const accessToken = input.accessToken.trim();
  const appSecret = input.appSecret.trim();
  if (!DIGITS.test(wabaId)) return { error: "The WhatsApp Business Account ID should be a number." };
  if (!DIGITS.test(phoneNumberId)) return { error: "The Phone Number ID should be a number." };
  if (accessToken.length < 20) return { error: "Paste the permanent access token." };

  return saveConnection({ organizationId: actor.organizationId, userId: actor.userId, method: "manual", wabaId, phoneNumberId, accessToken, appSecret: appSecret || null });
}

// Re-checks an existing connection with Meta and records the outcome, so a
// token that expired or was revoked shows up as a clear error instead of
// failing silently at the next campaign.
export async function testWhatsAppConnectionAction(): Promise<ConnectionResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_whatsapp_connections")
    .select("waba_id, phone_number_id, access_token_encrypted")
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (!data) return { error: "No WhatsApp number is connected." };

  try {
    const details = await inspectNumber({ accessToken: decryptSecret(data.access_token_encrypted), phoneNumberId: data.phone_number_id, wabaId: data.waba_id });
    await admin
      .from("organization_whatsapp_connections")
      .update({ status: "active", last_error: null, last_checked_at: new Date().toISOString(), display_phone_number: details.displayPhoneNumber, verified_name: details.verifiedName })
      .eq("organization_id", actor.organizationId);
    revalidatePath(WHATSAPP_PATH);
    return { success: true };
  } catch (err) {
    const message = describeWhatsAppError(err).message;
    await admin
      .from("organization_whatsapp_connections")
      .update({ status: "error", last_error: message, last_checked_at: new Date().toISOString() })
      .eq("organization_id", actor.organizationId);
    revalidatePath(WHATSAPP_PATH);
    return { error: message };
  }
}

// Deletes the stored credentials; the church goes back to the shared
// KingdomFlow number. Templates created under its own number stay on that
// number's WhatsApp account and can't be sent from KingdomFlow's.
export async function disconnectWhatsAppAction(): Promise<ConnectionResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const admin = createAdminClient();
  const { error } = await admin.from("organization_whatsapp_connections").delete().eq("organization_id", actor.organizationId);
  if (error) return { error: "Couldn't disconnect your WhatsApp number." };

  await logPlatformEvent({ level: "info", source: "whatsapp_send", message: "Organization disconnected its own WhatsApp number", organizationId: actor.organizationId });
  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

// Second half of Meta's "Embedded Signup": the browser has the one-time
// code from the Facebook login and the WABA / phone number IDs the signup
// flow reported. This swaps the code for a token, points the number's
// webhooks at the platform app, registers the number, and stores it.
// Requires the platform Meta app to be approved for Embedded Signup.
export async function completeEmbeddedSignupAction(input: { code: string; wabaId: string; phoneNumberId: string }): Promise<ConnectionResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;
  if (!isSecretBoxConfigured()) return NOT_CONFIGURED;

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) return NOT_CONFIGURED;
  if (!input.code || !DIGITS.test(input.wabaId) || !DIGITS.test(input.phoneNumberId)) return { error: "The WhatsApp signup didn't finish. Please try again." };

  let accessToken: string;
  try {
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code: input.code });
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/oauth/access_token?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw await parseGraphError(res);
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("Meta didn't return an access token.");
    accessToken = body.access_token;

    // Webhooks for this number then arrive at the platform's endpoint.
    const subscribe = await fetch(`https://graph.facebook.com/${API_VERSION}/${input.wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    if (!subscribe.ok) throw await parseGraphError(subscribe);

    // Registration is idempotent for an already-registered number; a
    // failure here isn't fatal to connecting.
    await fetch(`https://graph.facebook.com/${API_VERSION}/${input.phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin: String(Math.floor(100000 + Math.random() * 900000)) }),
    }).catch(() => {});
  } catch (err) {
    return { error: err instanceof Error ? describeWhatsAppError(err).message : "Couldn't finish connecting WhatsApp." };
  }

  return saveConnection({ organizationId: actor.organizationId, userId: actor.userId, method: "embedded_signup", wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, accessToken, appSecret: null });
}
