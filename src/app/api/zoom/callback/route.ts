import { NextResponse } from "next/server";
import { checkOAuthState } from "@/lib/conferencing/oauth-state";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { exchangeZoomCode, fetchZoomUser } from "@/lib/conferencing/zoom";
import { sealSecret } from "@/lib/security/connection-secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";

const back = (status: string) => NextResponse.redirect(`${getSiteUrl()}/dashboard/kconnect/conferencing?status=${status}`);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("error")) return back("denied");

  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return back("forbidden");

  const code = searchParams.get("code");
  if (!code || !checkOAuthState(searchParams.get("state"), user.id, membership.organization.id, "zoom")) return back("invalid_state");

  try {
    const tokens = await exchangeZoomCode(code);
    if (!tokens.refreshToken) return back("failed");
    const account = await fetchZoomUser(tokens.accessToken);
    const { error } = await createAdminClient().from("conference_connections").upsert(
      {
        organization_id: membership.organization.id,
        provider: "zoom",
        account_id: account.id,
        account_email: account.email || null,
        account_name: account.name || null,
        access_token: sealSecret(tokens.accessToken),
        refresh_token: sealSecret(tokens.refreshToken),
        token_expires_at: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
        connected_by: user.id,
      },
      { onConflict: "organization_id,provider" },
    );
    return back(error ? "save_failed" : "connected");
  } catch {
    return back("failed");
  }
}
