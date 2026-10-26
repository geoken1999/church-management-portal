import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_GATEWAY_POLICY, isPlatformGateway, type GatewayPolicy, type PlatformGateway } from "@/lib/payments/gateway-policy";

const PRIMARY_KEY = "payment_gateway_primary";
const FAILOVER_KEY = "payment_gateway_failover";

/** The platform admin's choice (platform_settings), or the default when nothing was ever set. Never throws: a payment must not fail over a settings read. */
export async function getGatewayPolicy(): Promise<GatewayPolicy> {
  try {
    const { data } = await createAdminClient().from("platform_settings").select("key, value").in("key", [PRIMARY_KEY, FAILOVER_KEY]);
    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
    const primary = byKey.get(PRIMARY_KEY);
    const failover = byKey.get(FAILOVER_KEY);
    return {
      primary: isPlatformGateway(primary) ? primary : DEFAULT_GATEWAY_POLICY.primary,
      failover: typeof failover === "boolean" ? failover : DEFAULT_GATEWAY_POLICY.failover,
    };
  } catch {
    return DEFAULT_GATEWAY_POLICY;
  }
}

export async function setGatewayPolicy(primary: PlatformGateway, failover: boolean): Promise<void> {
  const now = new Date().toISOString();
  await createAdminClient()
    .from("platform_settings")
    .upsert(
      [
        { key: PRIMARY_KEY, value: primary, updated_at: now },
        { key: FAILOVER_KEY, value: failover, updated_at: now },
      ],
      { onConflict: "key" },
    );
}
