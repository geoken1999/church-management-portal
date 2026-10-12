"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { GROUP_TAB, isGroupKey, parseGroupPost } from "@/lib/groups/shares";

export interface GroupShareResult {
  error?: string;
  success?: boolean;
}

// Shares a note and/or link with a group of members (Youth, Worship team,
// ...). Who may: anyone who can edit that group's own tab. Members of the
// group see it in the mobile app's Space tab.
export async function createGroupPostAction(groupKey: string, title: string, body: string, linkUrl: string, pagePath: string): Promise<GroupShareResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (!isGroupKey(groupKey)) return { error: "That group isn't valid." };

  const access = await checkTabAccess(membership.organization.id, GROUP_TAB[groupKey], "write");
  if (!access.ok) return { error: access.message };

  const parsed = parseGroupPost({ title, body, linkUrl });
  if (parsed.error || !parsed.post) return { error: parsed.error ?? "That isn't valid." };

  const admin = createAdminClient();
  const { error } = await admin.from("group_posts").insert({
    organization_id: membership.organization.id,
    group_key: groupKey,
    title: parsed.post.title,
    body: parsed.post.body,
    link_url: parsed.post.linkUrl,
    created_by: user.id,
  });
  if (error) return { error: "Couldn't share that. Please try again." };

  revalidatePath(pagePath);
  return { success: true };
}

export async function deleteGroupPostAction(postId: string, pagePath: string): Promise<GroupShareResult> {
  await requireUser();
  const membership = await requireOrganization();
  const admin = createAdminClient();
  const { data: post } = await admin.from("group_posts").select("organization_id, group_key").eq("id", postId).maybeSingle();
  if (!post || post.organization_id !== membership.organization.id) return { error: "That post could not be found." };

  const access = await checkTabAccess(post.organization_id, GROUP_TAB[post.group_key], "delete");
  if (!access.ok) return { error: access.message };

  const { error } = await admin.from("group_posts").delete().eq("id", postId);
  if (error) return { error: "Couldn't remove that. Please try again." };

  revalidatePath(pagePath);
  return { success: true };
}
