import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types/database";
import { pushToTeam } from "@/lib/push/team";

// Types whose callers already send their own, better-targeted push, or that
// are too minor to buzz a phone.
const NO_TEAM_PUSH: NotificationType[] = ["prayer_request", "account_deletion_request", "member_request", "youtube_video_updated", "facebook_post_updated"];

function pushForNotification(input: { organizationId: string; type: NotificationType; title: string; body?: string | null; link?: string | null }): void {
  if (NO_TEAM_PUSH.includes(input.type)) return;
  void pushToTeam({ organizationId: input.organizationId, title: input.title, body: input.body ?? input.title, link: input.link ?? undefined });
}

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
  pushForNotification(input);
}

// Same insert, but via the admin client — for callers with no user session
// to satisfy the "Admins can create notifications" RLS policy with (e.g.
// the Instagram webhook, which runs on Meta's server-to-server calls, not
// an authenticated request).
export async function createNotificationForWebhook(input: {
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    organization_id: input.organizationId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  });
  pushForNotification(input);
}
