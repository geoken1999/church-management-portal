import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { exchangeMeetCode, fetchGoogleUser } from "@/lib/conferencing/google-meet";
import { sealSecret } from "@/lib/security/connection-secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "meet_oauth_state";
const back = (status: string) => NextResponse.redirect(`${getSiteUrl()}/dashboard/kconnect/conferencing?status=${status}`);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("error")) return back("denied");

  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return back("forbidden");

  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || !expected || state !== expected) return back("invalid_state");

  try {
    const tokens = await exchangeMeetCode(code);
    if (!tokens.refreshToken) return back("failed");
    const account = await fetchGoogleUser(tokens.accessToken);
    const { error } = await createAdminClient().from("conference_connections").upsert(
      {
        organization_id: membership.organization.id,
        provider: "google_meet",
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
