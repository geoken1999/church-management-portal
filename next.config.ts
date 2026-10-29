import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// What this build is: the version in package.json, and the commit and time it was built from.
// Vercel provides the commit; locally it is read from git.
function git(command: string): string {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}
const appVersion = (
  JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
).version;

// Browser security headers.
//
// Applied everywhere: no MIME sniffing, a short referrer, HTTPS only, and only this site may use the camera,
// microphone, location and screen sharing (calls and live streams need them).
//
// The team's own screens (dashboard, sign-in, onboarding, platform admin) also refuse to be shown inside
// someone else's page, which blocks clickjacking. Public pages are left embeddable: churches put the
// website widget on their own sites.
//
// The content security policy is sent in REPORT-ONLY mode first: the browser lists what it would have
// blocked at /api/csp-report (Vercel logs) but blocks nothing. Once a few weeks of reports show nothing
// legitimate being flagged, switch the header name below to "Content-Security-Policy" to enforce it.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.cashfree.com https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.videosdk.live wss://*.videosdk.live https://api.razorpay.com https://sdk.cashfree.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "frame-src https://checkout.razorpay.com https://api.razorpay.com https://sdk.cashfree.com https://www.youtube.com https://www.youtube-nocookie.com",
  "form-action 'self' https://secure.payu.in https://test.payu.in",
  "base-uri 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(self), display-capture=(self)",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const NO_FRAMING = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: `${CSP}; frame-ancestors 'none'`,
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA ?? git("git rev-parse HEAD"),
    NEXT_PUBLIC_BUILD_MESSAGE: (
      process.env.VERCEL_GIT_COMMIT_MESSAGE ?? git("git log -1 --format=%s")
    ).split("\n")[0],
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "",
  },
  // Server Actions default to a 1MB request body — raised with headroom
  // above the largest app-level file limit (worship documents, 25MB;
  // multipart/form-data adds overhead on top of the raw file bytes).
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: BASE_HEADERS },
      ...[
        "/dashboard/:path*",
        "/platform-admin/:path*",
        "/onboarding/:path*",
        "/login",
        "/signup",
        "/auth/:path*",
      ].map((source) => ({
        source,
        headers: NO_FRAMING,
      })),
    ];
  },
  images: {
    // Wildcarded (not tied to one project ref) so this keeps working if the
    // configured Supabase project changes.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
