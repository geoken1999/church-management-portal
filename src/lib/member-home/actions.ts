"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sanitizeLayout, type HomeLayout } from "@/lib/member-home/schema";

const STUDIO_PATH = "/dashboard/mobile/design-studio";

export interface DesignStudioResult {
  error?: string;
  success?: boolean;
}

async function requireOrgAdmin() {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return null;
  return { userId: user.id, organizationId: membership.organization.id };
}

const NOT_ALLOWED: DesignStudioResult = { error: "Only an owner or admin can change the member home page." };

export async function saveHomeDraftAction(layout: HomeLayout): Promise<DesignStudioResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const parsed = sanitizeLayout(layout);
  if (parsed.error) return { error: parsed.error };

  const admin = createAdminClient();
  const { error } = await admin.from("member_home_layouts").upsert(
    { organization_id: actor.organizationId, status: "draft", layout: parsed.layout as unknown as Record<string, unknown>, updated_by: actor.userId, updated_at: new Date().toISOString() },
    { onConflict: "organization_id,status" },
  );
  if (error) return { error: "Couldn't save your draft." };

  revalidatePath(STUDIO_PATH);
  return { success: true };
}

// Validates the layout again server-side and writes it to both rows, so
// publishing always publishes exactly what was just checked, not whatever
// the last autosaved draft happened to be.
export async function publishHomeLayoutAction(layout: HomeLayout): Promise<DesignStudioResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const parsed = sanitizeLayout(layout);
  if (parsed.error) return { error: parsed.error };

  const now = new Date().toISOString();
  const value = parsed.layout as unknown as Record<string, unknown>;
  const admin = createAdminClient();
  const { error } = await admin.from("member_home_layouts").upsert(
    [
      { organization_id: actor.organizationId, status: "draft", layout: value, updated_by: actor.userId, updated_at: now },
      { organization_id: actor.organizationId, status: "published", layout: value, updated_by: actor.userId, updated_at: now },
    ],
    { onConflict: "organization_id,status" },
  );
  if (error) return { error: "Couldn't publish. Try again." };

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: "Member home page published",
    organizationId: actor.organizationId,
    metadata: { blocks: parsed.layout?.blocks.length ?? 0 },
  });

  revalidatePath(STUDIO_PATH);
  return { success: true };
}

// Throws the draft away and goes back to what members currently see.
export async function discardHomeDraftAction(): Promise<DesignStudioResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const admin = createAdminClient();
  const { error } = await admin.from("member_home_layouts").delete().eq("organization_id", actor.organizationId).eq("status", "draft");
  if (error) return { error: "Couldn't discard the draft." };

  revalidatePath(STUDIO_PATH);
  return { success: true };
}
