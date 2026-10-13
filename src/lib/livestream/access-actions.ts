"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getSiteUrl } from "@/lib/site-url";

const INBOX = "admin@kingdomflow.in";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A church asks for live streaming: we get an email and set it up with them.
export async function requestLiveStreamAccessAction(message: string): Promise<{ error?: string; success?: boolean }> {
  const user = await requireUser();
  const [membership, profile] = await Promise.all([requireOrganization(), getProfile()]);
  const org = membership.organization;
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Ask an owner or admin of your church to request this." };
  if (!isEmailConfigured()) return { error: "We couldn't send your request right now. Please email admin@kingdomflow.in instead." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("live_stream_access").select("enabled").eq("organization_id", org.id).maybeSingle();
  if (existing?.enabled) return { error: "Live streaming is already on for your church." };

  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : "";
  const note = message.trim().slice(0, 1000);
  const html = `
    <div style="font-family: sans-serif; max-width: 520px;">
      <h2 style="margin: 0 0 12px;">Live stream access requested</h2>
      <p style="margin: 0 0 4px;"><strong>Church:</strong> ${escapeHtml(org.name)}</p>
      <p style="margin: 0 0 4px;"><strong>Requested by:</strong> ${escapeHtml(name || "—")} (${escapeHtml(user.email ?? "no email")})</p>
      ${note ? `<p style="margin: 12px 0 4px;"><strong>Message:</strong></p><p style="white-space: pre-wrap; margin: 0;">${escapeHtml(note)}</p>` : ""}
      <p style="margin: 16px 0 0;"><a href="${getSiteUrl()}/platform-admin/tenants/${org.id}">Open this church in Super Admin</a> to turn live streaming on once you have agreed the setup and billing.</p>
    </div>`;

  const result = await sendBulkEmail({ fromName: "KingdomFlow", subject: `Live stream request: ${org.name}`, html, recipients: [INBOX], replyTo: user.email ?? undefined, organizationId: org.id });
  if (result.failed.length > 0) {
    await logPlatformEvent({ level: "warning", source: "email_send", message: `Live stream request email failed: ${result.failed[0]?.error ?? "unknown error"}`, organizationId: org.id });
    return { error: "We couldn't send your request. Please try again or email admin@kingdomflow.in." };
  }

  await admin.from("live_stream_access").upsert({ organization_id: org.id, requested_at: new Date().toISOString(), requested_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  revalidatePath("/dashboard/livestream");
  return { success: true };
}

// The team switches live streaming on or off for one church, with a note on what was agreed.
export async function setLiveStreamAccessAction(organizationId: string, enabled: boolean, note: string): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("live_stream_access")
    .upsert({ organization_id: organizationId, enabled, note: note.trim().slice(0, 1000) || null, updated_at: now, ...(enabled ? { enabled_at: now } : {}) }, { onConflict: "organization_id" });
  if (error) return { error: "Couldn't save that." };
  revalidatePath(`/platform-admin/tenants/${organizationId}`);
  revalidatePath("/dashboard/livestream");
  return {};
}
