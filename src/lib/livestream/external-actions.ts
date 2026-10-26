"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds } from "@/lib/push/audience";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { parseExternalLink, PLATFORM_NAMES } from "@/lib/livestream/external-link";

const PATH = "/dashboard/livestream";

export interface ExternalLiveResult {
  error?: string;
}

async function gate() {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "write");
  if (!access.ok) return { error: access.message } as const;
  return { organizationId, userId: user.id } as const;
}

// The church is live on YouTube or Facebook: members see a "Live now" card in the app and, if asked, get a notification
// that opens the stream. Only one such stream shows at a time; starting another ends the first.
export async function startExternalLiveAction(input: { title: string; url: string; notify: boolean }): Promise<ExternalLiveResult> {
  const g = await gate();
  if ("error" in g) return g;
  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Give the stream a title, for example Sunday Service." };
  const link = parseExternalLink(input.url);
  if ("error" in link) return { error: link.error };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from("external_live_streams").update({ ended_at: now }).eq("organization_id", g.organizationId).is("ended_at", null);
  const { data: created, error } = await admin
    .from("external_live_streams")
    .insert({ organization_id: g.organizationId, title, platform: link.platform, url: link.url, created_by: g.userId })
    .select("id")
    .single();
  if (error || !created) return { error: "Couldn't save that. Please try again." };

  if (input.notify) {
    // After the reply: sending to every member's phone can take a few seconds and the church shouldn't wait for it.
    after(async () => {
      try {
        const recipients = await resolveAudienceAuthIds(g.organizationId, { type: "church" });
        await sendPushToUsers(recipients, "church_announcement", {
          title: `${title} is live`,
          body: `Tap to watch on ${PLATFORM_NAMES[link.platform]}.`,
          // The app opens a YouTube or Facebook stream in its own player; an older app opens the link, which also works.
          data: { type: "external_live", externalId: created.id, url: link.url, platform: link.platform, title, link: link.url, buttonLabel: "Watch live" },
        });
        await admin.from("external_live_streams").update({ notified_at: new Date().toISOString() }).eq("id", created.id);
      } catch (err) {
        await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Couldn't notify members that "${title}" is live: ${err instanceof Error ? err.message : "unknown error"}`, organizationId: g.organizationId });
      }
    });
  }
  revalidatePath(PATH);
  return {};
}

export async function endExternalLiveAction(): Promise<ExternalLiveResult> {
  const g = await gate();
  if ("error" in g) return g;
  await createAdminClient().from("external_live_streams").update({ ended_at: new Date().toISOString() }).eq("organization_id", g.organizationId).is("ended_at", null);
  revalidatePath(PATH);
  return {};
}
