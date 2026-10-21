"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkTabAccess } from "@/lib/permissions/dal";
import {
  addMembers,
  addStaff,
  attachmentLink,
  createGroup,
  deleteMessage,
  loadGroup,
  removeParticipant,
  sendMessage,
  setParticipantRole,
  uploadSlot,
  type ChatActor,
} from "@/lib/group-chat/service";
import type { AttachmentKind } from "@/lib/group-chat/rules";
import type { ChurchGroupMessage } from "@/types/database";

const PATH = "/dashboard/groups";

export interface GroupResult {
  error?: string;
  success?: boolean;
  id?: string;
}

const fail = (error: string): GroupResult => ({ error });

type Level = "read" | "write" | "delete";

async function allowed(
  organizationId: string,
  level: Level,
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  if (!organizationId) return { ok: false, message: "Choose a church first." };
  const access = await checkTabAccess(organizationId, "groups", level);
  return access.ok
    ? { ok: true, userId: access.userId }
    : { ok: false, message: access.message };
}

async function actorFor(
  organizationId: string,
  level: Level,
): Promise<ChatActor | { error: string }> {
  const access = await allowed(organizationId, level);
  if (!access.ok) return { error: access.message };
  return { authUserId: access.userId, organizationId, manager: true };
}

export async function createGroupAction(
  organizationId: string,
  name: string,
  description: string,
): Promise<GroupResult> {
  const access = await allowed(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const result = await createGroup(organizationId, access.userId, {
    name,
    description,
  });
  if (!result.ok) return fail(result.error);
  revalidatePath(PATH);
  return { success: true, id: result.id };
}

export async function updateGroupAction(
  organizationId: string,
  groupId: string,
  name: string,
  description: string,
): Promise<GroupResult> {
  const access = await allowed(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 80)
    return fail("Give the group a name of 2 to 80 characters.");
  if (description.length > 500)
    return fail("Keep the description under 500 characters.");
  const { data, error } = await createAdminClient()
    .from("church_groups")
    .update({ name: clean, description: description.trim() || null })
    .eq("id", groupId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) return fail("That group could not be found.");
  revalidatePath(PATH);
  return { success: true };
}

// Archiving hides a group and its chat from everyone; nothing is deleted.
export async function archiveGroupAction(
  organizationId: string,
  groupId: string,
): Promise<GroupResult> {
  const access = await allowed(organizationId, "delete");
  if (!access.ok) return fail(access.message);
  const { data, error } = await createAdminClient()
    .from("church_groups")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) return fail("That group could not be found.");
  revalidatePath(PATH);
  return { success: true };
}

export async function addMembersAction(
  organizationId: string,
  groupId: string,
  memberIds: string[],
): Promise<GroupResult & { added?: number }> {
  const access = await allowed(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const result = await addMembers(
    groupId,
    organizationId,
    memberIds,
    access.userId,
  );
  if (!result.ok) return fail(result.error);
  revalidatePath(`${PATH}/${groupId}`);
  return { success: true, added: result.added };
}

export async function addStaffAction(
  organizationId: string,
  groupId: string,
  authUserId: string,
): Promise<GroupResult> {
  const access = await allowed(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const result = await addStaff(
    groupId,
    organizationId,
    authUserId,
    access.userId,
  );
  if (!result.ok) return fail(result.error);
  revalidatePath(`${PATH}/${groupId}`);
  return { success: true };
}

export async function removeParticipantAction(
  organizationId: string,
  groupId: string,
  participantId: string,
): Promise<GroupResult> {
  const access = await allowed(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const result = await removeParticipant(
    groupId,
    organizationId,
    participantId,
  );
  if (!result.ok) return fail(result.error);
  revalidatePath(`${PATH}/${groupId}`);
  return { success: true };
}

export async function setParticipantRoleAction(
  organizationId: string,
  groupId: string,
  participantId: string,
  role: "member" | "admin",
): Promise<GroupResult> {
  const access = await allowed(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const result = await setParticipantRole(
    groupId,
    organizationId,
    participantId,
    role === "admin" ? "admin" : "member",
  );
  if (!result.ok) return fail(result.error);
  revalidatePath(`${PATH}/${groupId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Chat, for the web dashboard (the apps read through the database directly and send through /api/mobile/groups)
// ---------------------------------------------------------------------------------------------

export interface WebMessage {
  id: string;
  senderAuthUserId: string | null;
  senderName: string;
  body: string | null;
  attachmentType: "image" | "file" | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  replyTo: string | null;
  replySender: string | null;
  replyBody: string | null;
  announcement: boolean;
  mentions: string[];
  createdAt: string;
  deleted: boolean;
}

export interface WebParticipant {
  id: string;
  authUserId: string | null;
  memberId: string | null;
  name: string;
  role: "member" | "admin";
  staff: boolean;
  hasLogin: boolean;
}

function toWeb(
  m: ChurchGroupMessage,
  parent: ChurchGroupMessage | undefined,
): WebMessage {
  return {
    id: m.id,
    senderAuthUserId: m.sender_auth_user_id,
    senderName: m.sender_name,
    body: m.body,
    attachmentType: m.attachment_type,
    attachmentName: m.attachment_name,
    attachmentSize: m.attachment_size,
    replyTo: m.reply_to,
    replySender: parent?.sender_name ?? null,
    replyBody: parent
      ? parent.deleted_at
        ? "This message was deleted"
        : (
            parent.body ??
            (parent.attachment_type === "image" ? "Photo" : "File")
          ).slice(0, 120)
      : null,
    announcement: m.is_announcement,
    mentions: m.mentions,
    createdAt: m.created_at,
    deleted: Boolean(m.deleted_at),
  };
}

/** The group's people, with names (a member's own name, or a team login's profile name). */
export async function loadParticipants(
  organizationId: string,
  groupId: string,
): Promise<WebParticipant[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("church_group_members")
    .select("id, member_id, auth_user_id, role")
    .eq("group_id", groupId)
    .eq("organization_id", organizationId);
  const memberIds = (rows ?? [])
    .map((r) => r.member_id)
    .filter((id): id is string => Boolean(id));
  const staffIds = (rows ?? [])
    .filter((r) => !r.member_id)
    .map((r) => r.auth_user_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: members }, { data: profiles }] = await Promise.all([
    memberIds.length
      ? admin
          .from("members")
          .select("id, first_name, last_name")
          .in("id", memberIds)
      : Promise.resolve({ data: [] }),
    staffIds.length
      ? admin
          .from("profiles")
          .select("auth_user_id, first_name, last_name")
          .in("auth_user_id", staffIds)
      : Promise.resolve({ data: [] }),
  ]);
  const memberName = new Map(
    (members ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`.trim()]),
  );
  const profileName = new Map(
    (profiles ?? []).map((p) => [
      p.auth_user_id,
      `${p.first_name} ${p.last_name}`.trim(),
    ]),
  );
  return (rows ?? [])
    .map((r) => ({
      id: r.id,
      authUserId: r.auth_user_id,
      memberId: r.member_id,
      name:
        (r.member_id
          ? memberName.get(r.member_id)
          : profileName.get(r.auth_user_id ?? "")) || "Church team",
      role: r.role,
      staff: !r.member_id,
      hasLogin: Boolean(r.auth_user_id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Newest messages first (before = the created_at of the oldest one already shown), 40 at a time.
export async function loadMessagesAction(
  organizationId: string,
  groupId: string,
  before?: string,
): Promise<{ error?: string; messages?: WebMessage[]; hasMore?: boolean }> {
  const access = await allowed(organizationId, "read");
  if (!access.ok) return { error: access.message };
  if (!(await loadGroup(groupId, organizationId)))
    return { error: "That group could not be found." };
  const admin = createAdminClient();
  let query = admin
    .from("church_group_messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(41);
  if (before) query = query.lt("created_at", before);
  const { data } = await query;
  const rows = (data ?? []) as ChurchGroupMessage[];
  const page = rows.slice(0, 40);
  const parentIds = [
    ...new Set(
      page.map((m) => m.reply_to).filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: parents } = parentIds.length
    ? await admin.from("church_group_messages").select("*").in("id", parentIds)
    : { data: [] };
  const byId = new Map(
    (parents ?? []).map((p) => [p.id, p as ChurchGroupMessage]),
  );
  return {
    messages: page.map((m) =>
      toWeb(m, m.reply_to ? byId.get(m.reply_to) : undefined),
    ),
    hasMore: rows.length > 40,
  };
}

export async function sendMessageAction(
  organizationId: string,
  groupId: string,
  input: {
    body: string;
    replyTo?: string | null;
    announcement?: boolean;
    mentions?: string[];
    attachment?: { path: string; name: string; size: number } | null;
  },
): Promise<{ error?: string; message?: WebMessage }> {
  const actor = await actorFor(organizationId, "write");
  if ("error" in actor) return { error: actor.error };
  const result = await sendMessage(actor, { groupId, ...input });
  if (!result.ok) return { error: result.error };
  return { message: toWeb(result.message, undefined) };
}

export async function uploadSlotAction(
  organizationId: string,
  groupId: string,
  name: string,
  size: number,
): Promise<{
  error?: string;
  path?: string;
  token?: string;
  kind?: AttachmentKind;
}> {
  const actor = await actorFor(organizationId, "write");
  if ("error" in actor) return { error: actor.error };
  const result = await uploadSlot(actor, groupId, { name, size });
  return result.ok
    ? { path: result.path, token: result.token, kind: result.kind }
    : { error: result.error };
}

export async function attachmentLinkAction(
  organizationId: string,
  messageId: string,
): Promise<{
  error?: string;
  url?: string;
  name?: string;
  kind?: AttachmentKind;
}> {
  const actor = await actorFor(organizationId, "read");
  if ("error" in actor) return { error: actor.error };
  const result = await attachmentLink(actor, messageId);
  return result.ok
    ? { url: result.url, name: result.name, kind: result.kind }
    : { error: result.error };
}

export async function deleteMessageAction(
  organizationId: string,
  messageId: string,
): Promise<GroupResult> {
  // Your own message needs Write; someone else's needs Delete.
  const own = await actorFor(organizationId, "write");
  if ("error" in own) return fail(own.error);
  const del = await allowed(organizationId, "delete");
  const result = await deleteMessage({ ...own, manager: del.ok }, messageId);
  return result.ok ? { success: true } : fail(result.error);
}
