import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getAuthUser, requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

function isPlatformAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** The person's active support-staff record, or null. Switched-off accounts count as none. */
export async function getActiveSupportStaff(authUserId: string): Promise<{ name: string; email: string } | null> {
  const { data } = await createAdminClient()
    .from("support_staff")
    .select("name, email, active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.active ? { name: data.name, email: data.email } : null;
}

export interface SupportAccess {
  user: User;
  kind: "admin" | "staff";
  name: string;
}

/**
 * Gate for the Support console and the ticket actions: Super Admin, or an active support-staff account. Checked on
 * every request, so switching someone off ends their access at once. Anyone else sees a 404.
 */
export async function requireSupportAccess(): Promise<SupportAccess> {
  const user = await requireUser();
  if (isPlatformAdminEmail(user.email)) return { user, kind: "admin", name: user.email ?? "Super Admin" };
  const staff = await getActiveSupportStaff(user.id);
  if (!staff) notFound();
  return { user, kind: "staff", name: staff.name };
}

/** Where a signed-in person with no church should go: the console for support staff, else onboarding. */
export async function redirectIfSupportStaff(): Promise<void> {
  const user = await getAuthUser();
  if (user && (await getActiveSupportStaff(user.id))) redirect("/support-desk");
}
