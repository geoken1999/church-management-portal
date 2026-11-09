import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { destinationFor, detectPlatform, isBot } from "@/lib/qr/links";

// The short link behind every dynamic QR code: /q/<code> sends the scan to the code's current destination, the
// platform's own one when it has one. Public, no sign-in. The redirect is temporary (302) and uncacheable so that
// changing a destination in the dashboard takes effect on the next scan.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = new URL("/", getSiteUrl());
  const admin = createAdminClient();
  const { data: qr } = await admin
    .from("qr_codes")
    .select("id, organization_id, status, expires_at, expired_url, destination_url, ios_url, android_url, desktop_url")
    .eq("code", code.toLowerCase())
    .maybeSingle();

  const noStore = { "Cache-Control": "no-store" };
  if (!qr) return NextResponse.redirect(home, { status: 302, headers: noStore });

  if (qr.status === "paused" || (qr.expires_at && new Date(qr.expires_at) < new Date())) {
    return NextResponse.redirect(qr.expired_url || home, { status: 302, headers: noStore });
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const platform = detectPlatform(userAgent);
  if (!isBot(userAgent)) {
    const country = request.headers.get("x-vercel-ip-country");
    after(async () => {
      await admin.rpc("record_qr_scan", { p_qr: qr.id, p_org: qr.organization_id, p_platform: platform, p_country: country });
    });
  }

  return NextResponse.redirect(destinationFor(qr, platform), { status: 302, headers: noStore });
}
