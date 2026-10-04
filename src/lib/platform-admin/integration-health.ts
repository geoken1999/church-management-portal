import "server-only";

import twilio from "twilio";
import { isSmsConfigured } from "@/lib/sms/env";
import { isWhatsAppConfigured, getMetaWhatsAppEnv } from "@/lib/whatsapp/env";
import { parseGraphError } from "@/lib/whatsapp/graph-error";
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

// SMS only — WhatsApp moved off Twilio entirely onto Meta's Cloud API
// directly (migration 0097); it used to ride on this same Account SID/
// Auth Token in "shared" mode, but checking Twilio's account status now
// says nothing about whether WhatsApp actually works (see
// checkMetaWhatsApp below for the real check).
async function checkTwilioSms(): Promise<IntegrationHealth> {
  const name = "Twilio SMS";
  if (!isSmsConfigured()) return unconfigured(name);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return unconfigured(name);

  try {
    const client = twilio(accountSid, authToken, { timeout: CHECK_TIMEOUT_MS });
    const account = await client.api.v2010.accounts(accountSid).fetch();
    if (account.status !== "active") return { name, status: "degraded", detail: `Account status: ${account.status}`, liveChecked: true };
    return { name, status: "operational", liveChecked: true };
  } catch (err) {
    return { name, status: "down", detail: err instanceof Error ? err.message : "Couldn't reach Twilio.", liveChecked: true };
  }
}

// The actual, currently-live WhatsApp integration (Meta Cloud API,
// direct — see src/lib/whatsapp/client.ts) — a GET against the
// configured phone number, authenticated with the same access token
// every real send uses, so an invalid/expired/corrupted token (the exact
// failure a church admin hit live: Meta's "The access token could not be
// decrypted") shows up here before it blocks an actual send. Read-only,
// side-effect-free. Shows Meta's raw error detail (not the softened
// church-admin-facing message describeWhatsAppError produces elsewhere)
// since this page's audience is the person who'd actually fix it.
async function checkMetaWhatsApp(): Promise<IntegrationHealth> {
  const name = "WhatsApp (Meta Cloud API)";
  if (!isWhatsAppConfigured()) return unconfigured(name);

  try {
    const { accessToken, phoneNumberId, apiVersion } = getMetaWhatsAppEnv();
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=verified_name,code_verification_status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await parseGraphError(res);
      const detail = err.code || err.type ? `${err.message} (code ${err.code ?? "?"}, ${err.type ?? "unknown type"})` : err.message;
      return { name, status: "down", detail, liveChecked: true };
    }
    const body = (await res.json()) as { code_verification_status?: string };
    if (body.code_verification_status && body.code_verification_status !== "VERIFIED") {
      return { name, status: "degraded", detail: `Phone number status: ${body.code_verification_status}`, liveChecked: true };
    }
    return { name, status: "operational", liveChecked: true };
  } catch (err) {
    return { name, status: "down", detail: err instanceof Error ? err.message : "Couldn't reach Meta's Graph API.", liveChecked: true };
  }
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
// Meta has a documented, reproducible quirk where this exact self-lookup
// returns a generic "system error" independent of whether the app
// credentials are actually valid — confirmed live: the identical message
// came back from three different Meta endpoints (this one, /debug_token,
// and the standard /oauth/access_token client-credentials grant) against
// credentials for an app whose real, per-org Instagram connections were
// demonstrably working at the same time. Treating this specific message
// as "down" was a false negative — the per-org OAuth tokens actual
// messaging runs on never touch this app-level lookup at all, so a
// failure here says nothing about whether Instagram/Facebook messaging
// itself works.
const META_APP_SELF_LOOKUP_QUIRK = "cannot get application info due to a system error";

async function checkMetaApp(name: string, appId: string | undefined, appSecret: string | undefined): Promise<IntegrationHealth> {
  if (!appId || !appSecret) return unconfigured(name);

  try {
    const url = `https://graph.facebook.com/v19.0/${appId}?access_token=${appId}|${appSecret}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error) {
      const message: string = body?.error?.message ?? `HTTP ${res.status}`;
      if (message.toLowerCase().includes(META_APP_SELF_LOOKUP_QUIRK)) {
        return {
          name,
          status: "degraded",
          detail: "Meta's own app-info lookup is returning a known system error — this doesn't verify per-org connections, which run on their own separate OAuth tokens and aren't affected by this.",
          liveChecked: true,
        };
      }
      return { name, status: "down", detail: message, liveChecked: true };
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
  const [twilioSms, whatsapp, resend, razorpay, instagram, facebook] = await Promise.all([
    checkTwilioSms(),
    checkMetaWhatsApp(),
    checkResend(),
    checkRazorpay(),
    checkMetaApp("Instagram", process.env.INSTAGRAM_APP_ID, process.env.INSTAGRAM_APP_SECRET),
    checkMetaApp("Facebook", process.env.FACEBOOK_APP_ID, process.env.FACEBOOK_APP_SECRET),
  ]);

  return [twilioSms, whatsapp, resend, razorpay, instagram, facebook, checkYouTube()];
}
