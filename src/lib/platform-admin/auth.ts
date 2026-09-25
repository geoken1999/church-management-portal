import "server-only";

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";

// There's no cross-organization "platform staff" role in this app's data
// model — every other permission concept (owner/admin/member, tab
// permissions) is scoped to a single church's own organization. Payouts
// for 'shared'-mode fundraisers are a genuinely cross-org concern (the
// platform, not any one church, owes the money), so this is gated by a
// plain email allowlist instead of adding a whole new role system for
// what is, for now, a single-operator surface.
export async function requirePlatformAdmin() {
  const user = await requireUser();
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !allowlist.includes(user.email.toLowerCase())) {
    notFound();
  }

  return user;
}
