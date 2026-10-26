"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { isPlatformGateway, PLATFORM_GATEWAYS } from "@/lib/payments/gateway-policy";
import { setGatewayPolicy } from "@/lib/payments/gateway-settings";
import { isPlatformCashfreeConfigured } from "@/lib/cashfree/platform";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Which gateway takes KingdomFlow's one-time payments first, and whether the other steps in when the first can't
// create an order. Making Cashfree primary during a Razorpay outage is one click here.
export async function saveGatewayPolicyAction(primary: string, failover: boolean): Promise<{ error?: string }> {
  const admin = await requirePlatformAdmin();
  if (!isPlatformGateway(primary)) return { error: "Choose Razorpay or Cashfree." };
  if ((primary === "cashfree" || failover) && !isPlatformCashfreeConfigured()) {
    return { error: "Cashfree isn't set up yet: add CASHFREE_APP_ID and CASHFREE_SECRET_KEY in the environment first." };
  }
  await setGatewayPolicy(primary, failover);
  await logPlatformEvent({
    level: "warning",
    source: "payment_gateway",
    message: `Platform admin (${admin.email ?? "unknown"}) set the payment gateway: ${PLATFORM_GATEWAYS.find((g) => g === primary)} first, failover ${failover ? "on" : "off"}`,
  });
  revalidatePath("/platform-admin/health");
  return {};
}
