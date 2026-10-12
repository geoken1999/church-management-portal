import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinancePlan, requireOwnPaymentGateway } from "@/lib/finance/actions";
import { validateGivingSettings } from "@/lib/finance/giving-settings";
import { normalizeGivingTypes } from "@/lib/finance/giving-types";
import { getSiteUrl } from "@/lib/site-url";

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
}

async function readState(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: org }, { data: account }, financeError, ownAllowedError] = await Promise.all([
    admin.from("organizations").select("giving_enabled, giving_mode, giving_types, giving_share_token").eq("id", organizationId).maybeSingle(),
    admin.from("organization_razorpay_accounts").select("id").eq("organization_id", organizationId).maybeSingle(),
    requireFinancePlan(organizationId),
    requireOwnPaymentGateway(organizationId),
  ]);
  return { org, ownConnected: Boolean(account), financeError, ownAllowedError };
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
