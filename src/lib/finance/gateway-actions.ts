"use server";

import { revalidatePath } from "next/cache";
import { sealSecret } from "@/lib/security/connection-secrets";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireFinancePlan,
  requireOwnPaymentGateway,
} from "@/lib/finance/actions";
import {
  GATEWAY_LABELS,
  isGateway,
  validateGatewayCredentials,
  type Gateway,
} from "@/lib/payments/gateways";
import { connectedGateways } from "@/lib/payments/own-accounts";

export interface GatewayActionState {
  error?: string;
  success?: boolean;
}

const PATHS = ["/dashboard/fundraisers", "/dashboard/mobile/giving"];

function refresh() {
  for (const path of PATHS) revalidatePath(path);
}

// Every gateway action is owner/admin only, on a plan that allows a church's
// own gateway.
async function authorize(): Promise<
  { error: string } | { organizationId: string; userId: string }
> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin")
    return { error: "Only an owner or admin can change payment gateways." };
  const organizationId = membership.organization.id;
  const financeError = await requireFinancePlan(organizationId);
  if (financeError) return { error: financeError };
  const ownError = await requireOwnPaymentGateway(organizationId);
  if (ownError) return { error: ownError };
  return { organizationId, userId: user.id };
}

// Connects (or updates) the church's account for a gateway, and makes it the
// gateway its own-account payments use.
export async function saveGatewayAccountAction(
  gatewayRaw: string,
  keyId: string,
  keySecret: string,
  environment: string,
): Promise<GatewayActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isGateway(gatewayRaw)) return { error: "Choose a payment gateway." };
  const gateway: Gateway = gatewayRaw;

  const checked = validateGatewayCredentials(gateway, {
    keyId,
    keySecret,
    environment,
  });
  if ("error" in checked) return { error: checked.error };

  const admin = createAdminClient();
  const { error } =
    gateway === "razorpay"
      ? await admin
          .from("organization_razorpay_accounts")
          .upsert(
            {
              organization_id: auth.organizationId,
              key_id: checked.keyId,
              key_secret: sealSecret(checked.keySecret),
              connected_by: auth.userId,
            },
            { onConflict: "organization_id" },
          )
      : await admin
          .from("organization_gateway_accounts")
          .upsert(
            {
              organization_id: auth.organizationId,
              gateway,
              key_id: checked.keyId,
              key_secret: sealSecret(checked.keySecret),
              environment: checked.environment,
              connected_by: auth.userId,
            },
            { onConflict: "organization_id,gateway" },
          );
  if (error)
    return {
      error: `Couldn't save that ${GATEWAY_LABELS[gateway]} account. Please try again.`,
    };

  await admin
    .from("organizations")
    .update({ own_gateway: gateway })
    .eq("id", auth.organizationId);

  refresh();
  return { success: true };
}

// Makes an already-connected gateway the one own-account payments use.
export async function setOwnGatewayAction(
  gatewayRaw: string,
): Promise<GatewayActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isGateway(gatewayRaw)) return { error: "Choose a payment gateway." };

  const connected = await connectedGateways(auth.organizationId);
  if (!connected[gatewayRaw])
    return {
      error: `Connect your ${GATEWAY_LABELS[gatewayRaw]} account first.`,
    };

  const admin = createAdminClient();
  await admin
    .from("organizations")
    .update({ own_gateway: gatewayRaw })
    .eq("id", auth.organizationId);

  refresh();
  return { success: true };
}

// Disconnects a gateway. If it was the one in use, anything that relied on the
// church's own account is switched off rather than left with a link that can
// never complete a payment.
export async function removeGatewayAccountAction(
  gatewayRaw: string,
): Promise<GatewayActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isGateway(gatewayRaw)) return { error: "Choose a payment gateway." };

  const admin = createAdminClient();
  if (gatewayRaw === "razorpay") {
    await admin
      .from("organization_razorpay_accounts")
      .delete()
      .eq("organization_id", auth.organizationId);
  } else {
    await admin
      .from("organization_gateway_accounts")
      .delete()
      .eq("organization_id", auth.organizationId)
      .eq("gateway", gatewayRaw);
  }

  const { data: org } = await admin
    .from("organizations")
    .select("own_gateway, giving_mode")
    .eq("id", auth.organizationId)
    .maybeSingle();
  if (org?.own_gateway === gatewayRaw) {
    await admin
      .from("fundraisers")
      .update({ payment_mode: null, payment_link_enabled: false })
      .eq("organization_id", auth.organizationId)
      .eq("payment_mode", "own");
    if (org.giving_mode === "own") {
      await admin
        .from("organizations")
        .update({ giving_enabled: false, giving_mode: null })
        .eq("id", auth.organizationId);
    }
  }

  refresh();
  return { success: true };
}
