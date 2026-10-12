import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileAdmin } from "@/lib/mobile/staff-auth";
import { requireFinancePlan, requireOwnPaymentGateway } from "@/lib/finance/actions";
import { validateGivingSettings } from "@/lib/finance/giving-settings";
import { normalizeGivingTypes } from "@/lib/finance/giving-types";
import { getSiteUrl } from "@/lib/site-url";

async function readSettings(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: org }, { data: account }, financeError, ownAllowedError] = await Promise.all([
    admin.from("organizations").select("giving_enabled, giving_mode, giving_types, giving_share_token").eq("id", organizationId).maybeSingle(),
    admin.from("organization_razorpay_accounts").select("id").eq("organization_id", organizationId).maybeSingle(),
    requireFinancePlan(organizationId),
    requireOwnPaymentGateway(organizationId),
  ]);
  return {
    org,
    ownConnected: Boolean(account),
    financeError,
    ownAllowedError,
  };
}

function toResponse(state: Awaited<ReturnType<typeof readSettings>>) {
  return {
    ok: true,
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

// The staff mobile app's Configuration > Giving: read and change how the church
// takes online gifts (which gateway, and which kinds of gift).
export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(toResponse(await readSettings(organizationId)));
}

export async function POST(request: Request) {
  let body: { organizationId?: unknown; enabled?: unknown; mode?: unknown; types?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;

  const state = await readSettings(organizationId);
  const checked = validateGivingSettings(
    { enabled: body.enabled === true, mode: typeof body.mode === "string" ? body.mode : null, types: body.types },
    { financeError: state.financeError, ownAllowedError: state.ownAllowedError, ownConnected: state.ownConnected },
  );
  if ("error" in checked) return NextResponse.json({ ok: false, error: checked.error });

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ giving_enabled: checked.value.enabled, giving_mode: checked.value.mode, giving_types: checked.value.types })
    .eq("id", organizationId);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save that. Please try again." });

  return NextResponse.json(toResponse(await readSettings(organizationId)));
}
