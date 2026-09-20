import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/types/database";

// Not itself a Server Action — a plain server-only helper other Server
// Actions call after a change that has no underlying table row to hook a
// DB trigger off (e.g. YouTube video/broadcast events, which aren't
// cached locally at all). RLS restricts the insert to org admins.
export async function createNotification(input: {
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").insert({
    organization_id: input.organizationId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  });
}
