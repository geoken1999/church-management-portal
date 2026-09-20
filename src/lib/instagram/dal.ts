import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/instagram/token";
import {
  fetchMedia,
  fetchAccountInsights,
  fetchConversations,
  type InstagramMediaPage,
  type InstagramInsightValue,
  type InstagramConversation,
} from "@/lib/instagram/client";

// Returns the full row, including access_token — this file is server-only
// and every caller must be careful never to forward that field into a
// Client Component prop. Pages should destructure a safe subset before
// passing data down (see getInstagramDashboardData below).
export const getInstagramConnection = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instagram_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

export interface InstagramConnectionSummary {
  username: string;
  accountType: string | null;
  profilePictureUrl: string | null;
  mediaCount: number | null;
  followersCount: number | null;
}

export type InstagramDashboardData =
  | { connected: false }
  | {
      connected: true;
      profile: InstagramConnectionSummary;
      media: InstagramMediaPage;
      insights: InstagramInsightValue[];
      conversations: { items: InstagramConversation[]; nextCursor: string | null };
      // True when the stored connection exists but the live Graph API calls
      // failed (expired/revoked token, Instagram outage, etc.) — the UI
      // shows a "reconnect" prompt instead of crashing the whole page.
      syncError: boolean;
    };

// Not cache()-wrapped: it performs live external calls and can write a
// refreshed token as a side effect, so it should run at most once per
// request rather than being memoized against accidental double-invocation.
export async function getInstagramDashboardData(organizationId: string): Promise<InstagramDashboardData> {
  const connection = await getInstagramConnection(organizationId);
  if (!connection) return { connected: false };

  const profile: InstagramConnectionSummary = {
    username: connection.username,
    accountType: connection.account_type,
    profilePictureUrl: connection.profile_picture_url,
    mediaCount: connection.media_count,
    followersCount: connection.followers_count,
  };

  try {
    const accessToken = await getValidAccessToken(connection);
    const [media, insights, conversations] = await Promise.all([
      fetchMedia(accessToken),
      fetchAccountInsights(accessToken),
      fetchConversations(accessToken),
    ]);
    return { connected: true, profile, media, insights, conversations, syncError: false };
  } catch {
    return {
      connected: true,
      profile,
      media: { items: [], nextCursor: null },
      insights: [],
      conversations: { items: [], nextCursor: null },
      syncError: true,
    };
  }
}
