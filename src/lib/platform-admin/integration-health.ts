import "server-only";

import twilio from "twilio";
import { isSmsConfigured } from "@/lib/sms/env";
import { isWhatsAppConfigured } from "@/lib/whatsapp/env";
import { isEmailConfigured, getEmailEnv } from "@/lib/email/env";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { createRazorpayClient } from "@/lib/billing/razorpay";

// A short per-check timeout — this feeds the Health page, which shouldn't
// hang (or worse, time out entirely) just because one third-party provider
// is slow to respond. 5s is generous for a single lightweight GET.
const CHECK_TIMEOUT_MS = 5000;

export type IntegrationHealthStatus = "operational" | "degraded" | "down" | "unconfigured";

export interface IntegrationHealth {
  name: string;
  status: IntegrationHealthStatus;
  detail?: string;
  // false for the handful of integrations (currently just YouTube) where
  // there's no cheap way to verify the credentials actually work without a
  // per-tenant OAuth token already in hand — those fall back to reporting
  // whether the app-wide env vars are merely present, same as before this
  // module existed.
  liveChecked: boolean;
}

function unconfigured(name: string): IntegrationHealth {
  return { name, status: "unconfigured", liveChecked: false };
}

function configuredOnly(name: string, configured: boolean): IntegrationHealth {
  return configured ? { name, status: "operational", liveChecked: false } : unconfigured(name);
}

// Twilio backs both SMS and (in shared mode) WhatsApp off the same
// Account SID/Auth Token — fetching the account once covers both, with
// each channel's own row still reflecting its own additional requirement
// (a from-number/messaging service for SMS, a WhatsApp-enabled sender for
// WhatsApp).
async function checkTwilio(): Promise<[IntegrationHealth, IntegrationHealth]> {
  const smsConfigured = isSmsConfigured();
  const whatsappConfigured = isWhatsAppConfigured();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return [unconfigured("Twilio SMS"), unconfigured("Twilio WhatsApp (shared)")];
  }

  let accountStatus: string | null = null;
  let error: string | null = null;
  try {
    const client = twilio(accountSid, authToken, { timeout: CHECK_TIMEOUT_MS });
    const account = await client.api.v2010.accounts(accountSid).fetch();
    accountStatus = account.status;
  } catch (err) {
    error = err instanceof Error ? err.message : "Couldn't reach Twilio.";
  }

  const build = (name: string, configured: boolean): IntegrationHealth => {
    if (!configured) return unconfigured(name);
    if (error) return { name, status: "down", detail: error, liveChecked: true };
    if (accountStatus !== "active") return { name, status: "degraded", detail: `Account status: ${accountStatus}`, liveChecked: true };
    return { name, status: "operational", liveChecked: true };
  };

  return [build("Twilio SMS", smsConfigured), build("Twilio WhatsApp (shared)", whatsappConfigured)];
}

// Deliberately a raw fetch() rather than the `resend` SDK used everywhere
// else in this app (src/lib/email/client.ts) — the SDK's own client
// internally console.errors any non-2xx response in every non-production
// environment (see node_modules/resend/dist/index.mjs's logError), which
// would spam the server console every time this runs against a key that's
// scoped to sending-only (see below) — expected, not a bug, but still
// noise this check shouldn't be causing on every Health page load. A
// direct request gets the exact same JSON body without going through that
// logging path.
async function checkResend(): Promise<IntegrationHealth> {
  const name = "Resend (email)";
  if (!isEmailConfigured()) return unconfigured(name);

  try {
    const { apiKey } = getEmailEnv();
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // A key scoped to "Sending access" only (Resend's recommended,
      // least-privilege setup for a key that only ever needs to send) can't
      // list domains at all, and Resend reports that with this specific
      // error name rather than an auth failure. Getting it back means the
      // key WAS authenticated — it's just correctly locked down — so this
      // is a pass, not a failure; only an actually-bad/expired key still
      // counts as down.
      if (body?.name === "restricted_api_key") {
        return { name, status: "operational", detail: "Key is scoped to sending only — full reachability not verified.", liveChecked: true };
      }
      return { name, status: "down", detail: body?.message || `HTTP ${res.status}`, liveChecked: true };
    }
    return { name, status: "operational", liveChecked: true };
  } catch (err) {
    return { name, status: "down", detail: err instanceof Error ? err.message : "Couldn't reach Resend.", liveChecked: true };
  }
}

async function checkRazorpay(): Promise<IntegrationHealth> {
  const name = "Razorpay (billing & giving)";
  if (!isRazorpayConfigured()) return unconfigured(name);

  try {
    const client = createRazorpayClient();
    await client.orders.all({ count: 1 });
    return { name, status: "operational", liveChecked: true };
  } catch (err) {
    return { name, status: "down", detail: err instanceof Error ? err.message : "Couldn't reach Razorpay.", liveChecked: true };
  }
}

// Meta's Graph API accepts an "app access token" — the literal string
// "{app-id}|{app-secret}" — for server-to-server calls that verify the
// app's own credentials without needing any tenant's per-account OAuth
// token. A GET on the app's own node either echoes its id/name back (valid
// credentials) or 400s with an OAuthException (invalid) — a genuine,
// read-only, side-effect-free reachability check.
async function checkMetaApp(name: string, appId: string | undefined, appSecret: string | undefined): Promise<IntegrationHealth> {
  if (!appId || !appSecret) return unconfigured(name);

  try {
    const url = `https://graph.facebook.com/v19.0/${appId}?access_token=${appId}|${appSecret}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error) {
      return { name, status: "down", detail: body?.error?.message ?? `HTTP ${res.status}`, liveChecked: true };
    }
    return { name, status: "operational", liveChecked: true };
  } catch (err) {
    return { name, status: "down", detail: err instanceof Error ? err.message : "Couldn't reach Meta's Graph API.", liveChecked: true };
  }
}

// YouTube's credentials are an OAuth 2.0 client id/secret — there's no
// cheap way to verify those actually work without a real per-tenant
// refresh token already on hand (unlike Meta's app-access-token trick or a
// simple authenticated account-info GET), so this stays a configuration
// check only, same as before this module existed.
function checkYouTube(): IntegrationHealth {
  return configuredOnly("YouTube", Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET));
}

// Every third-party service this app's SHARED (not per-tenant-connected)
// features depend on — Vercel and the Supabase Management API are
// deliberately excluded, since the Health page already has dedicated,
// live-checked cards for both elsewhere on the same page.
export async function getIntegrationHealth(): Promise<IntegrationHealth[]> {
  const [twilioResults, resend, razorpay, instagram, facebook] = await Promise.all([
    checkTwilio(),
    checkResend(),
    checkRazorpay(),
    checkMetaApp("Instagram", process.env.INSTAGRAM_APP_ID, process.env.INSTAGRAM_APP_SECRET),
    checkMetaApp("Facebook", process.env.FACEBOOK_APP_ID, process.env.FACEBOOK_APP_SECRET),
  ]);

  return [...twilioResults, resend, razorpay, instagram, facebook, checkYouTube()];
}
