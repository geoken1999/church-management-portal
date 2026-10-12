import { NextResponse } from "next/server";
import { verifyPayUReturn } from "@/lib/payu/client";
import { finalizePayUGivingOrderPayment } from "@/lib/finance/payu-giving";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";
import { isGivingType } from "@/lib/finance/giving-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnAccount } from "@/lib/payments/own-accounts";
import { payuBaseUrl } from "@/lib/payments/gateways";
import type { PayUAccount } from "@/lib/payu/client";

// The church a giving link belongs to: a church-wide link, or a fundraiser's.
async function organizationIdForGivingToken(token: string, isChurch: boolean): Promise<string | null> {
  const admin = createAdminClient();
  if (isChurch) {
    const { data } = await admin.from("organizations").select("id").eq("giving_share_token", token).maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await admin.from("fundraisers").select("organization_id").eq("share_token", token).maybeSingle();
  return data?.organization_id ?? null;
}

// PayU redirects the browser here with a POST, for both success (surl) and
// failure (furl) — only for 'shared'-mode fundraiser giving; 'own' mode
// still goes through Razorpay Checkout's in-page callback, unaffected by
// this route. token (the fundraiser's share token) travels in this URL's
// own query string (set when the order was created), separate from the
// hash-covered POST body PayU sends. No session exists here, the same as
// the other PayU return routes — the hash check is what's trusted.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/`, { status: 303 });
  }

  // A church-wide gift lands back on the church's own giving page.
  const isChurch = url.searchParams.get("scope") === "church";
  const typeParam = url.searchParams.get("type");
  const basePath = isChurch ? `/give/church/${token}` : `/give/${token}`;
  const typeQuery = isChurch && typeParam && isGivingType(typeParam) ? `&type=${typeParam}` : "";
  const giveUrl = (status: string, extra?: string) =>
    NextResponse.redirect(`${siteUrl}${basePath}?payment=${status}${typeQuery}${extra ? `&${extra}` : ""}`, { status: 303 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return giveUrl("failed", "reason=bad_request");
  }

  const get = (name: string) => String(form.get(name) ?? "");
  const status = get("status");
  const txnid = get("txnid");
  const mihpayid = get("mihpayid");
  const hash = get("hash");

  // A church's own PayU account verifies with its own salt, not the platform's.
  let account: PayUAccount | undefined;
  if (url.searchParams.get("own") === "1") {
    const organizationId = await organizationIdForGivingToken(token, isChurch);
    const own = organizationId ? await getOwnAccount(organizationId, "payu") : null;
    if (!own) return giveUrl("failed", "reason=unverified");
    account = { merchantKey: own.keyId, salt: own.keySecret, baseUrl: payuBaseUrl(own.environment) };
  }

  const valid = verifyPayUReturn(
    {
    status,
    txnid,
    amount: get("amount"),
    productinfo: get("productinfo"),
    firstname: get("firstname"),
    email: get("email"),
    udf1: get("udf1"),
    hash,
    },
    account,
  );

  if (!valid) {
    await logPlatformEvent({
      level: "error",
      source: "fundraiser_giving",
      message: "PayU giving return had an invalid hash — treated as unverified, not credited",
      metadata: { txnid, status, token },
    });
    return giveUrl("failed", "reason=unverified");
  }

  if (status !== "success") {
    return giveUrl("failed", "reason=declined");
  }

  const result = await finalizePayUGivingOrderPayment(txnid, mihpayid);
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "fundraiser_giving",
      message: `PayU giving payment verified but couldn't be finalized: ${result.error}`,
      metadata: { txnid, mihpayid, token },
    });
    return giveUrl("failed", "reason=finalize_failed");
  }

  return giveUrl("success");
}
