import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSignedRequest } from "@/lib/instagram/signed-request";

// Meta calls this server-to-server when someone removes the app from their
// Instagram account settings — there's no user session on this request, so
// the RPC (not RLS-gated table access) is what actually performs the
// delete. Required by Meta for App Review regardless of whether it's ever
// actually triggered in testing.
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

    return NextResponse.json({ url: "", confirmation_code: payload.user_id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
