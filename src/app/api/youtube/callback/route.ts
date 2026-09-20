import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchChannel } from "@/lib/youtube/client";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "yt_oauth_state";

function redirectToYouTube(status: string) {
  return NextResponse.redirect(`${getSiteUrl()}/dashboard/youtube?status=${status}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // The user denied the Google consent screen — not an error on our end,
  // just a no-op.
  if (searchParams.get("error")) {
    return redirectToYouTube("denied");
  }

  const user = await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return redirectToYouTube("forbidden");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToYouTube("invalid_state");
  }

  try {
    const redirectUri = `${getSiteUrl()}/api/youtube/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.refreshToken) {
      // Shouldn't happen — the authorize URL forces prompt=consent — but a
      // connection we can't refresh later is worse than none at all.
      return redirectToYouTube("failed");
    }

    const channel = await fetchChannel(tokens.accessToken);
    const tokenExpiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString();

    const supabase = await createClient();
    const { error } = await supabase.from("youtube_connections").upsert(
      {
        organization_id: membership.organization.id,
        channel_id: channel.id,
        channel_title: channel.title,
        thumbnail_url: channel.thumbnailUrl,
        subscriber_count: channel.subscriberCount,
        video_count: channel.videoCount,
        view_count: channel.viewCount,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokenExpiresAt,
        connected_by: user.id,
      },
      { onConflict: "organization_id" },
    );

    if (error) {
      return redirectToYouTube("save_failed");
    }

    return redirectToYouTube("connected");
  } catch {
    return redirectToYouTube("failed");
  }
}
