import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lets the mobile app open a call page in its in-app browser already signed in:
// the app posts its session here, the server sets the usual sign-in cookies, and
// the browser is sent on to the call page. Only the in-app call pages can be the
// destination, so this can't be used to land someone elsewhere.
export async function POST(request: Request) {
  const form = await request.formData();
  const accessToken = String(form.get("access_token") ?? "");
  const refreshToken = String(form.get("refresh_token") ?? "");
  const next = String(form.get("next") ?? "");
  if (
    !accessToken ||
    !refreshToken ||
    !/^\/app-call\/[0-9a-f-]{36}(\?mode=(video|audio))?$/.test(next)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );

  return NextResponse.redirect(new URL(next, request.url), 303);
}
