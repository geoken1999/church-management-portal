import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPosts,
  fetchPageInsights,
  fetchConversations,
  type FacebookPostPage,
  type FacebookInsightValue,
  type FacebookConversation,
} from "@/lib/facebook/client";

// Returns the full row, including access_token — this file is server-only
// and every caller must be careful never to forward that field into a
// Client Component prop.
export const getFacebookConnection = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("facebook_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

export interface FacebookConnectionSummary {
  pageId: string;
  pageName: string;
  pagePictureUrl: string | null;
  fanCount: number | null;
  connectedAt: string;
}

export type FacebookDashboardData =
  | { connected: false }
  | {
      connected: true;
      page: FacebookConnectionSummary;
      posts: FacebookPostPage;
      insights: FacebookInsightValue[];
      conversations: { items: FacebookConversation[]; nextCursor: string | null };
      syncError: boolean;
    };

// Not cache()-wrapped — performs live external calls, so it should run at
// most once per request rather than being memoized against accidental
// double-invocation.
export async function getFacebookDashboardData(organizationId: string): Promise<FacebookDashboardData> {
  const connection = await getFacebookConnection(organizationId);
  if (!connection) return { connected: false };

  const page: FacebookConnectionSummary = {
    pageId: connection.page_id,
    pageName: connection.page_name,
    pagePictureUrl: connection.page_picture_url,
    fanCount: connection.fan_count,
    connectedAt: connection.created_at,
  };

  try {
    const [posts, insights, conversations] = await Promise.all([
      fetchPosts(connection.access_token, connection.page_id),
      fetchPageInsights(connection.access_token, connection.page_id),
      fetchConversations(connection.access_token, connection.page_id),
    ]);
    return { connected: true, page, posts, insights, conversations, syncError: false };
  } catch {
    return {
      connected: true,
      page,
      posts: { items: [], nextCursor: null },
      insights: [],
      conversations: { items: [], nextCursor: null },
      syncError: true,
    };
  }
}
