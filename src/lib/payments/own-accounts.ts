import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Gateway } from "@/lib/payments/gateways";

export interface OwnAccount {
  keyId: string;
  keySecret: string;
  environment: "live" | "test";
}

// The church's own credentials for [gateway], or null if it hasn't connected
// that one. Razorpay's live in their own table; PayU and Cashfree share one.
export async function getOwnAccount(organizationId: string, gateway: Gateway): Promise<OwnAccount | null> {
  const admin = createAdminClient();
  if (gateway === "razorpay") {
    const { data } = await admin.from("organization_razorpay_accounts").select("key_id, key_secret").eq("organization_id", organizationId).maybeSingle();
    return data ? { keyId: data.key_id, keySecret: data.key_secret, environment: "live" } : null;
  }
  const { data } = await admin
    .from("organization_gateway_accounts")
    .select("key_id, key_secret, environment")
    .eq("organization_id", organizationId)
    .eq("gateway", gateway)
    .maybeSingle();
  return data ? { keyId: data.key_id, keySecret: data.key_secret, environment: data.environment as "live" | "test" } : null;
}

export async function getOwnGatewayChoice(organizationId: string): Promise<Gateway> {
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("own_gateway").eq("id", organizationId).maybeSingle();
  return (data?.own_gateway as Gateway | undefined) ?? "razorpay";
}

export async function connectedGateways(organizationId: string): Promise<Record<Gateway, boolean>> {
  const admin = createAdminClient();
  const [{ data: razorpay }, { data: others }] = await Promise.all([
    admin.from("organization_razorpay_accounts").select("id").eq("organization_id", organizationId).maybeSingle(),
    admin.from("organization_gateway_accounts").select("gateway").eq("organization_id", organizationId),
  ]);
  const names = new Set((others ?? []).map((row) => row.gateway));
  return { razorpay: Boolean(razorpay), payu: names.has("payu"), cashfree: names.has("cashfree") };
}
