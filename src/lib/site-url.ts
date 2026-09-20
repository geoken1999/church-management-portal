import "server-only";

// Resolves the app's public base URL for building absolute links (auth
// email redirects, the public join link/QR code, shareable document
// links). Priority:
//
// 1. NEXT_PUBLIC_SITE_URL — an explicitly configured custom domain. Always
//    wins when set, since it's the only source that's correct for a custom
//    domain fronting a Vercel deployment.
// 2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production domain, set
//    automatically on every Vercel deployment. Preferred over VERCEL_URL so
//    production links don't depend on which specific deployment/build
//    happened to serve the request.
// 3. VERCEL_URL — the current deployment's own domain, set automatically on
//    Vercel (including preview deployments). Used only if the above aren't
//    available, so preview deployments still generate working links.
// 4. http://localhost:3000 — local development fallback.
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
