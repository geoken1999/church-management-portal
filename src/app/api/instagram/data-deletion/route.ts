import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSignedRequest } from "@/lib/instagram/signed-request";
import { getSiteUrl } from "@/lib/site-url";

// Meta's Data Deletion Request callback. We don't cache posts, messages, or
// insights anywhere — the only Instagram-derived data this app stores at
// all is the connection row itself (profile summary + token), so deleting
// that row satisfies the request in full.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const signedRequest = String(formData.get("signed_request") ?? "");

    const payload = parseSignedRequest(signedRequest);
    if (!payload?.user_id) {
      return NextResponse.json({ error: "Invalid signed request" }, { status: 400 });
    }

    const supabase = await createClient();
    await supabase.rpc("delete_instagram_connection_by_ig_user", { ig_user_id: payload.user_id });

    return NextResponse.json({
      url: `${getSiteUrl()}/instagram/deletion-status?code=${payload.user_id}`,
      confirmation_code: payload.user_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
