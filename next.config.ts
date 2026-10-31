import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { contentSecurityPolicy, cspHeaderName } from "./src/lib/security/csp";

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
// The content security policy (src/lib/security/csp.ts) is enforced. Anything it blocks is still reported to
// /api/csp-report (Vercel logs, "[csp-report]"). If it ever blocks something it should not, set CSP_MODE=report-only
// in Vercel and redeploy to turn it back into a log-only policy while the allow-list is fixed.
const CSP_HEADER = cspHeaderName();

const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(self), display-capture=(self)",
  },
  { key: CSP_HEADER, value: contentSecurityPolicy() },
];

const NO_FRAMING = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: CSP_HEADER,
    value: contentSecurityPolicy({ framingAllowed: false }),
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
