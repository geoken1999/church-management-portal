import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchManagedPages,
  fetchPageProfile,
} from "@/lib/facebook/client";
import { PENDING_PAGES_COOKIE } from "@/lib/facebook/constants";
import { getSiteUrl } from "@/lib/site-url";

const STATE_COOKIE = "fb_oauth_state";

function redirectToFacebook(status: string) {
  return NextResponse.redirect(`${getSiteUrl()}/dashboard/facebook?status=${status}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // The user denied the Facebook permission dialog — not an error on our
  // end, just a no-op.
  if (searchParams.get("error")) {
    return redirectToFacebook("denied");
  }

  const user = await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return redirectToFacebook("forbidden");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToFacebook("invalid_state");
  }

  try {
    const redirectUri = `${getSiteUrl()}/api/facebook/callback`;
    const shortLived = await exchangeCodeForUserToken(code, redirectUri);
    const longLived = await exchangeForLongLivedUserToken(shortLived.accessToken);
    const pages = await fetchManagedPages(longLived.accessToken);

    if (pages.length === 0) {
      return redirectToFacebook("no_pages");
    }

    if (pages.length === 1) {
      const page = pages[0];
      const profile = await fetchPageProfile(page.accessToken, page.id);

      const supabase = await createClient();
      const { error } = await supabase.from("facebook_connections").upsert(
        {
          organization_id: membership.organization.id,
          page_id: page.id,
          page_name: profile.name,
          page_picture_url: profile.pictureUrl,
          fan_count: profile.fanCount,
          access_token: page.accessToken,
          connected_by: user.id,
        },
        { onConflict: "organization_id" },
      );

      if (error) {
        return redirectToFacebook("save_failed");
      }

      return redirectToFacebook("connected");
    }

    // More than one Page — stage the list (minus nothing hidden from the
    // server, but the picker UI only ever sees id/name/picture) so the
    // admin can pick which one to connect.
    cookieStore.set(PENDING_PAGES_COOKIE, JSON.stringify(pages), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return redirectToFacebook("choose_page");
  } catch {
    return redirectToFacebook("failed");
  }
}
