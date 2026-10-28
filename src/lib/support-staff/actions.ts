"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
import { logPlatformEvent } from "@/lib/platform-events/log";

const PATH = "/platform-admin/support-team";

export interface AddSupportStaffState {
  error?: string;
  success?: string;
}

// Super Admin only. Creates the sign-in (already confirmed, no password yet), records them as support staff, and
// emails a link to choose a password.
export async function addSupportStaff(_prev: AddSupportStaffState, formData: FormData): Promise<AddSupportStaffState> {
  const superAdmin = await requirePlatformAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (name.length < 2) return { error: "Enter their name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("support_staff").select("id").ilike("email", email).maybeSingle();
  if (existing) return { error: "That person is already on the support team." };

  // A person who already has an account (for example a church owner) keeps it; their email just gains the console.
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name: name.split(" ")[0] } });
  if (created.data.user) {
    userId = created.data.user.id;
  } else {
    const { data: profile } = await admin.from("profiles").select("auth_user_id").ilike("email", email).maybeSingle();
    userId = profile?.auth_user_id ?? null;
  }
  if (!userId) return { error: "Couldn't create that sign-in. Please try again." };

  const { error } = await admin.from("support_staff").insert({ auth_user_id: userId, email, name, created_by: superAdmin.id });
  if (error) return { error: "Couldn't save. Please try again." };

  await sendPasswordResetLink(email);
  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Super Admin (${superAdmin.email ?? "unknown"}) added ${email} to the support team`,
  });
  revalidatePath(PATH);
  return { success: `${name} was added. They have an email to choose a password.` };
}

export async function setSupportStaffActive(formData: FormData) {
  const superAdmin = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const { data } = await createAdminClient().from("support_staff").update({ active }).eq("id", id).select("email").maybeSingle();
  if (data) {
    await logPlatformEvent({
      level: "info",
      source: "platform_admin",
      message: `Super Admin (${superAdmin.email ?? "unknown"}) ${active ? "switched on" : "switched off"} support access for ${data.email}`,
    });
  }
  revalidatePath(PATH);
}

export async function removeSupportStaff(formData: FormData) {
  const superAdmin = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data } = await admin.from("support_staff").select("email, auth_user_id").eq("id", id).maybeSingle();
  if (!data) return;
  await admin.from("support_staff").delete().eq("id", id);
  // Delete the sign-in too, unless it belongs to someone who also has a church.
  const { count } = await admin.from("organization_members").select("id", { count: "exact", head: true }).eq("auth_user_id", data.auth_user_id);
  if (!count) await admin.auth.admin.deleteUser(data.auth_user_id);
  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Super Admin (${superAdmin.email ?? "unknown"}) removed ${data.email} from the support team`,
  });
  revalidatePath(PATH);
}
