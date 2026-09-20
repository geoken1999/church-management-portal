import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, fetchProfile } from "@/lib/instagram/client";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "ig_oauth_state";

function redirectToInstagram(status: string) {
  return NextResponse.redirect(`${getSiteUrl()}/dashboard/instagram?status=${status}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // The user denied the Instagram permission dialog — not an error on our
  // end, just a no-op.
  if (searchParams.get("error")) {
    return redirectToInstagram("denied");
  }

  const user = await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return redirectToInstagram("forbidden");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToInstagram("invalid_state");
  }

  try {
    const redirectUri = `${getSiteUrl()}/api/instagram/callback`;
    const shortLived = await exchangeCodeForShortLivedToken(code, redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken);
    const profile = await fetchProfile(longLived.accessToken);
    const tokenExpiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString();

    const supabase = await createClient();
    const { error } = await supabase.from("instagram_connections").upsert(
      {
        organization_id: membership.organization.id,
        instagram_user_id: profile.id,
        username: profile.username,
        account_type: profile.accountType,
        profile_picture_url: profile.profilePictureUrl,
        media_count: profile.mediaCount,
        followers_count: profile.followersCount,
        access_token: longLived.accessToken,
        token_expires_at: tokenExpiresAt,
        connected_by: user.id,
      },
      { onConflict: "organization_id" },
    );

    if (error) {
      return redirectToInstagram("save_failed");
    }

    return redirectToInstagram("connected");
  } catch {
    return redirectToInstagram("failed");
  }
}
