import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { logPlatformEvent } from "@/lib/platform-events/log";
import {
  GROUP_CHAT_BUCKET,
  attachmentKind,
  attachmentPath,
  attachmentProblem,
  isOwnAttachmentPath,
  messageProblem,
  notificationRecipients,
  previewOf,
  type AttachmentKind,
} from "@/lib/group-chat/rules";
import type { ChurchGroup, ChurchGroupMessage } from "@/types/database";

// The writing side of group chats. Everything here uses the service role, so each function checks for itself that
// the person may do what they ask (see the migration: signed-in users have no write access to these tables).

export interface ChatActor {
  authUserId: string;
  /** Owners, admins and anyone with write access to the Groups tab: may post, delete and manage in any group of the church. */
  manager: boolean;
  organizationId: string;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

export async function loadGroup(
  groupId: string,
  organizationId: string,
): Promise<ChurchGroup | null> {
  const { data } = await createAdminClient()
    .from("church_groups")
    .select("*")
    .eq("id", groupId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ?? null;
}

/** The name people see for a login in a church: their member record, else their team profile. */
export async function displayName(
  organizationId: string,
  authUserId: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("first_name, last_name")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (member) return `${member.first_name} ${member.last_name}`.trim();
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : "Church team";
}

async function participantRow(groupId: string, authUserId: string) {
  const { data } = await createAdminClient()
    .from("church_group_members")
    .select("id, role")
    .eq("group_id", groupId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data;
}

/** A team login joins a group's chat (once) so they can post and be notified. */
export async function ensureStaffParticipant(
  groupId: string,
  organizationId: string,
  authUserId: string,
): Promise<void> {
  if (await participantRow(groupId, authUserId)) return;
  await createAdminClient().from("church_group_members").insert({
    group_id: groupId,
    organization_id: organizationId,
    auth_user_id: authUserId,
    role: "admin",
    added_by: authUserId,
  });
}

// ---------------------------------------------------------------------------------------------
// Groups and their people (managers)
// ---------------------------------------------------------------------------------------------

export async function createGroup(
  organizationId: string,
  authUserId: string,
  input: { name: string; description: string },
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80)
    return fail("Give the group a name of 2 to 80 characters.");
  if (input.description.length > 500)
    return fail("Keep the description under 500 characters.");
  const { data, error } = await createAdminClient()
    .from("church_groups")
    .insert({
      organization_id: organizationId,
      name,
      description: input.description.trim() || null,
      created_by: authUserId,
    })
    .select("id")
    .single();
  if (error || !data)
    return fail(
      "Couldn't create the group. Check that the group chats migration has been applied.",
    );
  return { ok: true, id: data.id };
}

export async function addMembers(
  groupId: string,
  organizationId: string,
  memberIds: string[],
  addedBy: string,
): Promise<Result<{ added: number }>> {
  const admin = createAdminClient();
  const group = await loadGroup(groupId, organizationId);
  if (!group || group.archived_at)
    return fail("That group could not be found.");
  const ids = [...new Set(memberIds)].slice(0, 500);
  if (ids.length === 0) return fail("Choose at least one person.");
  // Only active members of this church, and only those not already in.
  const [{ data: members }, { data: existing }] = await Promise.all([
    admin
      .from("members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("id", ids),
    admin
      .from("church_group_members")
      .select("member_id")
      .eq("group_id", groupId)
      .not("member_id", "is", null),
  ]);
  const already = new Set((existing ?? []).map((r) => r.member_id));
  const toAdd = (members ?? [])
    .map((m) => m.id)
    .filter((id) => !already.has(id));
  if (toAdd.length === 0) return fail("Those people are already in the group.");
  const { error } = await admin.from("church_group_members").insert(
    toAdd.map((member_id) => ({
      group_id: groupId,
      organization_id: organizationId,
      member_id,
      added_by: addedBy,
    })),
  );
  if (error) return fail("Couldn't add them. Please try again.");
  return { ok: true, added: toAdd.length };
}

export async function addStaff(
  groupId: string,
  organizationId: string,
  authUserId: string,
  addedBy: string,
): Promise<Result<object>> {
  const admin = createAdminClient();
  const group = await loadGroup(groupId, organizationId);
  if (!group || group.archived_at)
    return fail("That group could not be found.");
  const { data: team } = await admin
    .from("organization_members")
    .select("auth_user_id")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!team) return fail("That person is not on this church's team.");
  if (await participantRow(groupId, authUserId))
    return fail("They are already in the group.");
  const { error } = await admin.from("church_group_members").insert({
    group_id: groupId,
    organization_id: organizationId,
    auth_user_id: authUserId,
    role: "admin",
    added_by: addedBy,
  });
  return error ? fail("Couldn't add them. Please try again.") : { ok: true };
}

export async function removeParticipant(
  groupId: string,
  organizationId: string,
  participantId: string,
): Promise<Result<object>> {
  const { data, error } = await createAdminClient()
    .from("church_group_members")
    .delete()
    .eq("id", participantId)
    .eq("group_id", groupId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  return error || !data
    ? fail("That person could not be found in the group.")
    : { ok: true };
}

export async function setParticipantRole(
  groupId: string,
  organizationId: string,
  participantId: string,
  role: "member" | "admin",
): Promise<Result<object>> {
  const { data, error } = await createAdminClient()
    .from("church_group_members")
    .update({ role })
    .eq("id", participantId)
    .eq("group_id", groupId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  return error || !data
    ? fail("That person could not be found in the group.")
    : { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

export interface SendInput {
  groupId: string;
  body: string;
  replyTo?: string | null;
  announcement?: boolean;
  mentions?: string[];
  attachment?: { path: string; name: string; size: number } | null;
}

export async function sendMessage(
  actor: ChatActor,
  input: SendInput,
): Promise<Result<{ message: ChurchGroupMessage }>> {
  const admin = createAdminClient();
  // The group, everyone in it (which also tells who the sender is) and the sender's name, all at once.
  const [group, { data: participants }, senderName] = await Promise.all([
    loadGroup(input.groupId, actor.organizationId),
    admin
      .from("church_group_members")
      .select("id, auth_user_id, role, notify_mode, muted_until")
      .eq("group_id", input.groupId),
    displayName(actor.organizationId, actor.authUserId),
  ]);
  if (!group || group.archived_at)
    return fail("That group could not be found.");

  let role: "member" | "admin" | null =
    (participants ?? []).find((p) => p.auth_user_id === actor.authUserId)
      ?.role ?? null;
  if (!role) {
    if (!actor.manager) return fail("You are not in this group.");
    await ensureStaffParticipant(
      group.id,
      actor.organizationId,
      actor.authUserId,
    );
    role = "admin";
  }
  const announcement = Boolean(input.announcement);
  if (announcement && role !== "admin" && !actor.manager)
    return fail("Only group admins can post announcements.");

  let kind: AttachmentKind | null = null;
  if (input.attachment) {
    const a = input.attachment;
    const problem = attachmentProblem({ name: a.name, size: a.size });
    if (problem) return fail(problem);
    if (
      !isOwnAttachmentPath(
        a.path,
        actor.organizationId,
        group.id,
        actor.authUserId,
      )
    )
      return fail("The file did not upload. Please try again.");
    // The file must really be in storage.
    const folder = a.path.slice(0, a.path.lastIndexOf("/"));
    const { data: listed } = await admin.storage
      .from(GROUP_CHAT_BUCKET)
      .list(folder, { search: a.path.slice(a.path.lastIndexOf("/") + 1) });
    if (!listed?.some((f) => `${folder}/${f.name}` === a.path))
      return fail("The file did not upload. Please try again.");
    kind = attachmentKind(a.name);
  }
  const body = input.body.trim();
  const problem = messageProblem({
    body,
    hasAttachment: Boolean(input.attachment),
    announcement,
  });
  if (problem) return fail(problem);

  // A reply must be to a message of this group.
  let replyTo: string | null = null;
  if (input.replyTo) {
    const { data: parent } = await admin
      .from("church_group_messages")
      .select("id")
      .eq("id", input.replyTo)
      .eq("group_id", group.id)
      .maybeSingle();
    replyTo = parent?.id ?? null;
  }

  const inGroup = new Set(
    (participants ?? [])
      .map((p) => p.auth_user_id)
      .filter((id): id is string => Boolean(id)),
  );
  const mentions = [...new Set(input.mentions ?? [])]
    .filter((id) => inGroup.has(id) && id !== actor.authUserId)
    .slice(0, 50);

  const { data: message, error } = await admin
    .from("church_group_messages")
    .insert({
      group_id: group.id,
      organization_id: actor.organizationId,
      sender_auth_user_id: actor.authUserId,
      sender_name: senderName,
      body: body || null,
      attachment_path: input.attachment?.path ?? null,
      attachment_name: input.attachment
        ? input.attachment.name.slice(0, 200)
        : null,
      attachment_type: kind,
      attachment_size: input.attachment?.size ?? null,
      reply_to: replyTo,
      is_announcement: announcement,
      mentions,
    })
    .select("*")
    .single();
  if (error || !message)
    return fail("Couldn't send the message. Please try again.");

  // What happens next does not hold up the sender: their marker, and telling the others. It runs after the
  // response is sent, and a failure here never un-sends the message.
  const notify = async () => {
    try {
      await admin
        .from("church_group_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("group_id", group.id)
        .eq("auth_user_id", actor.authUserId);
      const recipients = notificationRecipients(
        (participants ?? []).map((p) => ({
          authUserId: p.auth_user_id,
          notifyMode: p.notify_mode,
          mutedUntil: p.muted_until,
        })),
        { senderAuthUserId: actor.authUserId, mentions, announcement },
        new Date(),
      );
      if (recipients.length > 0) {
        const preview = previewOf(message.body, kind);
        await sendPushToUsers(recipients, "group_post", {
          title: announcement ? `${group.name}: announcement` : group.name,
          body: announcement ? preview : `${senderName}: ${preview}`,
          data: {
            type: "group_chat",
            groupId: group.id,
            groupName: group.name,
          },
        });
      }
    } catch (err) {
      await logPlatformEvent({
        level: "warning",
        source: "group_chat",
        message: `Group message notification failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: actor.organizationId,
        metadata: { groupId: group.id },
      });
    }
  };
  try {
    after(notify);
  } catch {
    // Not inside a request (for example a script): just do it now.
    await notify();
  }
  return { ok: true, message };
}

export async function deleteMessage(
  actor: ChatActor,
  messageId: string,
): Promise<Result<object>> {
  const admin = createAdminClient();
  const { data: message } = await admin
    .from("church_group_messages")
    .select("id, group_id, sender_auth_user_id, attachment_path, deleted_at")
    .eq("id", messageId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (!message || message.deleted_at)
    return fail("That message could not be found.");
  const mine = message.sender_auth_user_id === actor.authUserId;
  const groupAdmin =
    (await participantRow(message.group_id, actor.authUserId))?.role ===
    "admin";
  if (!mine && !groupAdmin && !actor.manager)
    return fail("You can only delete your own messages.");
  const { error } = await admin
    .from("church_group_messages")
    .update({
      deleted_at: new Date().toISOString(),
      body: null,
      attachment_path: null,
      attachment_name: null,
      attachment_type: null,
      attachment_size: null,
      mentions: [],
    })
    .eq("id", message.id);
  if (error) return fail("Couldn't delete the message. Please try again.");
  if (message.attachment_path)
    await admin.storage
      .from(GROUP_CHAT_BUCKET)
      .remove([message.attachment_path])
      .catch(() => undefined);
  return { ok: true };
}

const LINK_SECONDS = 600;

/** A short-lived link to a message's file, for someone in the group (or a manager of the church). */
export async function attachmentLink(
  actor: ChatActor,
  messageId: string,
): Promise<Result<{ url: string; name: string; kind: AttachmentKind }>> {
  const admin = createAdminClient();
  const { data: message } = await admin
    .from("church_group_messages")
    .select("group_id, attachment_path, attachment_name, attachment_type")
    .eq("id", messageId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (!message?.attachment_path) return fail("There is no file to open.");
  if (
    !actor.manager &&
    !(await participantRow(message.group_id, actor.authUserId))
  )
    return fail("You are not in this group.");
  const { data, error } = await admin.storage
    .from(GROUP_CHAT_BUCKET)
    .createSignedUrl(message.attachment_path, LINK_SECONDS, {
      download:
        message.attachment_type === "file"
          ? (message.attachment_name ?? true)
          : false,
    });
  if (error || !data) return fail("Couldn't open that file. Please try again.");
  return {
    ok: true,
    url: data.signedUrl,
    name: message.attachment_name ?? "File",
    kind: message.attachment_type === "image" ? "image" : "file",
  };
}

/** A one-time upload link for a file the person is about to send; the path is chosen here, inside their own folder. */
export async function uploadSlot(
  actor: ChatActor,
  groupId: string,
  file: { name: string; size: number },
): Promise<Result<{ path: string; token: string; kind: AttachmentKind }>> {
  const group = await loadGroup(groupId, actor.organizationId);
  if (!group || group.archived_at)
    return fail("That group could not be found.");
  if (!actor.manager && !(await participantRow(group.id, actor.authUserId)))
    return fail("You are not in this group.");
  const problem = attachmentProblem(file);
  if (problem) return fail(problem);
  const path = attachmentPath(
    actor.organizationId,
    group.id,
    actor.authUserId,
    file.name,
    crypto.randomUUID(),
  );
  const { data, error } = await createAdminClient()
    .storage.from(GROUP_CHAT_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data)
    return fail("Couldn't start the upload. Please try again.");
  return {
    ok: true,
    path,
    token: data.token,
    kind: attachmentKind(file.name) as AttachmentKind,
  };
}

/** The signed-in member or team login behind a bearer token, with the church they are in for this group. */
export async function actorForGroup(
  authUserId: string,
  groupId: string,
): Promise<ChatActor | null> {
  const { data } = await createAdminClient()
    .from("church_group_members")
    .select("organization_id")
    .eq("group_id", groupId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data
    ? { authUserId, organizationId: data.organization_id, manager: false }
    : null;
}
