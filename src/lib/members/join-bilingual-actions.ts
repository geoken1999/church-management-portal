"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectTranslatableStrings, sanitizeBilingual } from "@/lib/bilingual/config";
import { ensureTranslations } from "@/lib/bilingual/translate";

export interface JoinBilingualState {
  error?: string;
  success?: boolean;
  warning?: string;
}

// The member join form's two-language setting. The built-in questions
// (first name, phone, ...) come from the app's own translations; only the
// church's custom fields need translating, so that is all this does.
export async function updateJoinBilingualAction(choiceJson: string): Promise<JoinBilingualState> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only an owner or admin can change the join form's languages." };
  }
  const organizationId = membership.organization.id;

  let wanted: ReturnType<typeof sanitizeBilingual> = null;
  try {
    wanted = choiceJson ? sanitizeBilingual(JSON.parse(choiceJson)) : null;
  } catch {
    return { error: "That language choice isn't valid." };
  }

  const admin = createAdminClient();
  let bilingual = null;
  let warning: string | undefined;
  if (wanted) {
    const [{ data: definitions }, { data: org }] = await Promise.all([
      admin.from("member_field_definitions").select("label, options").eq("organization_id", organizationId),
      admin.from("organizations").select("join_bilingual").eq("id", organizationId).maybeSingle(),
    ]);
    const outcome = await ensureTranslations(wanted, collectTranslatableStrings({ fields: definitions ?? [] }), sanitizeBilingual(org?.join_bilingual));
    bilingual = outcome.config;
    warning = outcome.warning;
  }

  const { error } = await admin.from("organizations").update({ join_bilingual: bilingual }).eq("id", organizationId);
  if (error) return { error: "Couldn't save the language setting. Please try again." };

  revalidatePath("/dashboard/members");
  revalidatePath(`/join/${membership.organization.slug}`);
  return { success: true, warning };
}
