"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { saveGivingConfig } from "@/lib/finance/giving-config";

export interface SaveGivingState {
  error?: string;
  success?: boolean;
}

// The web Giving page's Save. Owner/admin only.
export async function saveGivingSettingsAction(enabled: boolean, mode: string, types: string[]): Promise<SaveGivingState> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can change this." };

  const result = await saveGivingConfig(membership.organization.id, { enabled, mode: mode || null, types });
  if ("error" in result) return { error: result.error };

  revalidatePath("/dashboard/mobile/giving");
  return { success: true };
}
