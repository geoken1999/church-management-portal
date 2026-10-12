import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinancePlan, requireOwnPaymentGateway } from "@/lib/finance/actions";
import { validateGivingSettings } from "@/lib/finance/giving-settings";
import { normalizeGivingTypes } from "@/lib/finance/giving-types";
import { getSiteUrl } from "@/lib/site-url";
import { connectedGateways } from "@/lib/payments/own-accounts";
import { GATEWAY_LABELS, type Gateway } from "@/lib/payments/gateways";

export interface GivingConfig {
  enabled: boolean;
  mode: "own" | "shared" | null;
  types: string[];
  link: string | null;
  financeAvailable: boolean;
  financeMessage: string | null;
  ownGatewayAvailable: boolean;
  ownGatewayMessage: string | null;
  ownConnected: boolean;
  // Which gateway "own account" uses, and which are connected.
  ownGateway: Gateway;
  ownGatewayLabel: string;
  connected: Record<Gateway, boolean>;
}

async function readState(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: org }, connected, financeError, ownAllowedError] = await Promise.all([
    admin.from("organizations").select("giving_enabled, giving_mode, giving_types, giving_share_token, own_gateway").eq("id", organizationId).maybeSingle(),
    connectedGateways(organizationId),
    requireFinancePlan(organizationId),
    requireOwnPaymentGateway(organizationId),
  ]);
  const ownGateway = (org?.own_gateway ?? "razorpay") as Gateway;
  return { org, connected, ownGateway, ownConnected: connected[ownGateway], financeError, ownAllowedError };
}

function toConfig(state: Awaited<ReturnType<typeof readState>>): GivingConfig {
  return {
    enabled: state.org?.giving_enabled ?? false,
    mode: state.org?.giving_mode ?? null,
    types: normalizeGivingTypes(state.org?.giving_types ?? []),
    link: state.org ? `${getSiteUrl()}/give/church/${state.org.giving_share_token}` : null,
    financeAvailable: !state.financeError,
    financeMessage: state.financeError,
    ownGatewayAvailable: !state.ownAllowedError,
    ownGatewayMessage: state.ownAllowedError,
    ownConnected: state.ownConnected,
    ownGateway: state.ownGateway,
    ownGatewayLabel: GATEWAY_LABELS[state.ownGateway],
    connected: state.connected,
  };
}

// A church's online-giving settings, shared by the web Giving page and the
// staff mobile app. Callers have already checked the person is an owner/admin.
export async function getGivingConfig(organizationId: string): Promise<GivingConfig> {
  return toConfig(await readState(organizationId));
}

export async function saveGivingConfig(
  organizationId: string,
  input: { enabled: boolean; mode: string | null; types: unknown },
): Promise<{ error: string } | { config: GivingConfig }> {
  const state = await readState(organizationId);
  const checked = validateGivingSettings(input, {
    financeError: state.financeError,
    ownAllowedError: state.ownAllowedError,
    ownConnected: state.ownConnected,
  });
  if ("error" in checked) return { error: checked.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ giving_enabled: checked.value.enabled, giving_mode: checked.value.mode, giving_types: checked.value.types })
    .eq("id", organizationId);
  if (error) return { error: "Couldn't save that. Please try again." };

  return { config: toConfig(await readState(organizationId)) };
}
