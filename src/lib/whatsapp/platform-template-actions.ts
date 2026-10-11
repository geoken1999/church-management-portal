"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { addPlatformTemplateToOwnAccount, refreshPlatformTemplates, submitPlatformTemplate } from "@/lib/whatsapp/platform-templates";

const ADMIN_PATH = "/platform-admin/whatsapp-templates";

export interface PlatformTemplateResult {
  error?: string;
  success?: boolean;
}

// Platform admin: sends one catalog template (or every one not yet sent) to
// WhatsApp for review in the platform's own account.
export async function submitPlatformTemplatesAction(keys: string[]): Promise<PlatformTemplateResult> {
  const admin = await requirePlatformAdmin();
  const errors: string[] = [];
  for (const key of keys) {
    const result = await submitPlatformTemplate(key);
    if (result.error) errors.push(`${key}: ${result.error}`);
  }
  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${admin.email ?? "unknown"}) submitted ${keys.length} WhatsApp template(s) for review`,
    metadata: { keys },
  });
  revalidatePath(ADMIN_PATH);
  return errors.length > 0 ? { error: errors.join(" | ") } : { success: true };
}

export async function refreshPlatformTemplatesAction(): Promise<PlatformTemplateResult> {
  await requirePlatformAdmin();
  await refreshPlatformTemplates();
  revalidatePath(ADMIN_PATH);
  return { success: true };
}

// A church with its own WhatsApp number: add a platform template to its own
// account. Owner/admin only.
export async function addPlatformTemplateToMyAccountAction(platformTemplateId: string): Promise<PlatformTemplateResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can add a template." };

  const result = await addPlatformTemplateToOwnAccount(membership.organization.id, platformTemplateId);
  if (result.error) return result;
  revalidatePath("/dashboard/whatsapp");
  return { success: true };
}
