import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Records a sensitive action (publishing a course, deciding an enrollment, assigning an instructor,
// changing settings, deleting something). Best effort: a failure to write the trail never undoes or
// blocks the action itself, but it is logged.
export async function logLmsEvent(input: {
  organizationId: string;
  actorAuthUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await createAdminClient()
      .from("lms_audit_events")
      .insert({
        organization_id: input.organizationId,
        actor_auth_user_id: input.actorAuthUserId,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        metadata: input.metadata ?? {},
      });
  } catch (err) {
    console.error("logLmsEvent failed:", err);
  }
}
