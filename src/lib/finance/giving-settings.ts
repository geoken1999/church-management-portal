import { normalizeGivingTypes, type GivingType } from "@/lib/finance/giving-types";

export interface GivingSettingsInput {
  enabled: boolean;
  mode: string | null;
  types: unknown;
}

export interface GivingSettingsContext {
  financeError: string | null;
  ownAllowedError: string | null;
  ownConnected: boolean;
}

// Checks a church's online-giving settings before saving. Pure, so the rules
// are testable: giving needs the Finance plan; a gateway must be chosen and at
// least one kind of gift accepted; the church's own gateway needs a plan that
// allows it and a connected Razorpay account.
export function validateGivingSettings(
  input: GivingSettingsInput,
  context: GivingSettingsContext,
): { error: string } | { value: { enabled: boolean; mode: "own" | "shared" | null; types: GivingType[] } } {
  const types = normalizeGivingTypes(input.types);
  const mode = input.mode === "own" || input.mode === "shared" ? input.mode : null;

  if (!input.enabled) return { value: { enabled: false, mode, types } };

  if (context.financeError) return { error: context.financeError };
  if (!mode) return { error: "Choose which payment gateway collects the gifts." };
  if (types.length === 0) return { error: "Choose at least one kind of gift to accept." };
  if (mode === "own") {
    if (context.ownAllowedError) return { error: context.ownAllowedError };
    if (!context.ownConnected) return { error: "Connect your Razorpay account on the web (Finance) before using your own gateway." };
  }
  return { value: { enabled: true, mode, types } };
}
