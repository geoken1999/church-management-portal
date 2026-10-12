// Whether an email is on the platform-admin allowlist (PLATFORM_ADMIN_EMAILS).
// The same list requirePlatformAdmin checks, for code that needs to know
// without redirecting a non-admin.
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
