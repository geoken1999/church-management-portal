import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// What this build is: the version in package.json, and the commit and time it was built from.
// Vercel provides the commit; locally it is read from git.
function git(command: string): string {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}
const appVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? git("git rev-parse HEAD"),
    NEXT_PUBLIC_BUILD_MESSAGE: (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? git("git log -1 --format=%s")).split("\n")[0],
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
