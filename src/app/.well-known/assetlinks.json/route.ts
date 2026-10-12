import { NextResponse } from "next/server";

// Lets the KingdomFlow Android app open K-Connect invite links (/kmeet/<id>,
// /kaudio/<id>) directly. Needs ANDROID_CERT_SHA256 (the app signing
// certificate's SHA-256 fingerprint, several separated by commas); without it the
// links simply open in the browser.
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const statements =
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: "com.nexora.kingdomflow", sha256_cert_fingerprints: fingerprints },
          },
        ];
  return NextResponse.json(statements, { headers: { "Cache-Control": "public, max-age=3600" } });
}
