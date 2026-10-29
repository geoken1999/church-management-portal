import { NextResponse } from "next/server";
import { checkOAuthState } from "@/lib/conferencing/oauth-state";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { exchangeMeetCode, fetchGoogleUser } from "@/lib/conferencing/google-meet";
import { logPlatformEvent } from "@/lib/platform-events/log";
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
  if (!code || !checkOAuthState(searchParams.get("state"), user.id, membership.organization.id, "google_meet")) return back("invalid_state");

  // Each step reports its own status, and the reason goes to Super Admin -> Logs, so a failure can be traced.
  const fail = async (status: string, step: string, e: unknown) => {
    await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Google Meet connect failed at ${step}: ${e instanceof Error ? e.message : String(e)}`, organizationId: membership.organization.id });
    return back(status);
  };

  let tokens: Awaited<ReturnType<typeof exchangeMeetCode>>;
  try {
    tokens = await exchangeMeetCode(code);
  } catch (e) {
    return fail("token_failed", "the sign-in code exchange", e);
  }
  if (!tokens.refreshToken) return fail("token_failed", "the sign-in code exchange", new Error("no refresh token returned"));

  let account: Awaited<ReturnType<typeof fetchGoogleUser>>;
  try {
    account = await fetchGoogleUser(tokens.accessToken);
  } catch (e) {
    return fail("profile_failed", "reading the account profile", e);
  }

  let sealedAccess: string;
  let sealedRefresh: string;
  try {
    sealedAccess = sealSecret(tokens.accessToken);
    sealedRefresh = sealSecret(tokens.refreshToken);
  } catch (e) {
    return fail("encryption_failed", "encrypting the tokens", e);
  }

  const { error } = await createAdminClient().from("conference_connections").upsert(
    {
      organization_id: membership.organization.id,
      provider: "google_meet",
      account_id: account.id,
      account_email: account.email || null,
      account_name: account.name || null,
      access_token: sealedAccess,
      refresh_token: sealedRefresh,
      token_expires_at: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
      connected_by: user.id,
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) return fail("save_failed", "saving the connection", error);
  return back("connected");
}
