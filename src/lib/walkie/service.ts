import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { generateParticipantToken } from "@/lib/kmeet/token";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds } from "@/lib/push/audience";
import { GROUP_KEYS, GROUP_LABELS, type GroupKey } from "@/lib/groups/shares";
import type { WalkieChannel } from "@/types/database";

// Walkie-talkie channels for a church's groups, run on VideoSDK audio rooms. Who may use one: anyone in that group,
// and a church's owner and admins for every group. A channel lives until someone ends it, or 12 hours, whichever is
// first, so one forgotten after a service does not stay open.

export const CHANNEL_MAX_HOURS = 12;

const GROUP_TABLES: Record<GroupKey, "leaders" | "youths" | "worship_team_members" | "media_team_members" | "committee_members"> = {
  leaders: "leaders",
  youth: "youths",
  worship: "worship_team_members",
  media: "media_team_members",
  committee: "committee_members",
};

export interface GroupAccess {
  organizationId: string;
  groupKey: GroupKey;
  /** An owner or admin: may also end a channel someone else started. */
  isAdmin: boolean;
}

/** Every (church, group) this person may use a channel in. */
export async function groupAccessFor(userId: string): Promise<GroupAccess[]> {
  const admin = createAdminClient();
  const [{ data: staff }, { data: memberRows }] = await Promise.all([
    admin.from("organization_members").select("organization_id, role").eq("auth_user_id", userId),
    admin.from("members").select("id, organization_id").eq("auth_user_id", userId).eq("status", "active"),
  ]);

  const access = new Map<string, GroupAccess>();
  const add = (organizationId: string, groupKey: GroupKey, isAdmin: boolean) => {
    const key = `${organizationId}:${groupKey}`;
    const existing = access.get(key);
    access.set(key, { organizationId, groupKey, isAdmin: isAdmin || !!existing?.isAdmin });
  };

  for (const s of staff ?? []) {
    if (s.role === "owner" || s.role === "admin") for (const g of GROUP_KEYS) add(s.organization_id, g, true);
  }
  await Promise.all(
    (memberRows ?? []).flatMap((m) =>
      GROUP_KEYS.map(async (g) => {
        const { count } = await admin.from(GROUP_TABLES[g]).select("member_id", { count: "exact", head: true }).eq("organization_id", m.organization_id).eq("member_id", m.id);
        if ((count ?? 0) > 0) add(m.organization_id, g, false);
      }),
    ),
  );
  return [...access.values()];
}

const stillLive = (c: Pick<WalkieChannel, "status" | "started_at">) =>
  c.status === "live" && Date.now() - Date.parse(c.started_at) < CHANNEL_MAX_HOURS * 3_600_000;

async function endExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - CHANNEL_MAX_HOURS * 3_600_000).toISOString();
  await createAdminClient().from("walkie_channels").update({ status: "ended", ended_at: new Date().toISOString() }).eq("status", "live").lt("started_at", cutoff);
}

export interface ChannelView {
  id: string;
  name: string;
  groupKey: GroupKey;
  groupLabel: string;
  startedAt: string;
  canEnd: boolean;
}

export interface WalkieOverview {
  channels: ChannelView[];
  /** The groups this person may start a channel for (none already live). */
  startable: { organizationId: string; groupKey: GroupKey; groupLabel: string }[];
}

export async function listChannels(userId: string): Promise<WalkieOverview> {
  await endExpired();
  const access = await groupAccessFor(userId);
  if (access.length === 0) return { channels: [], startable: [] };

  const admin = createAdminClient();
  const { data } = await admin
    .from("walkie_channels")
    .select("*")
    .eq("status", "live")
    .in("organization_id", [...new Set(access.map((a) => a.organizationId))]);
  const live = (data ?? []).filter(stillLive);

  const channels: ChannelView[] = [];
  for (const c of live) {
    const a = access.find((x) => x.organizationId === c.organization_id && x.groupKey === c.group_key);
    if (!a) continue;
    channels.push({ id: c.id, name: c.name, groupKey: c.group_key, groupLabel: GROUP_LABELS[c.group_key], startedAt: c.started_at, canEnd: a.isAdmin || c.started_by === userId });
  }
  const startable = access
    .filter((a) => !live.some((c) => c.organization_id === a.organizationId && c.group_key === a.groupKey))
    .map((a) => ({ organizationId: a.organizationId, groupKey: a.groupKey, groupLabel: GROUP_LABELS[a.groupKey] }));
  return { channels, startable };
}

export type WalkieResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export async function startChannel(userId: string, organizationId: string, groupKey: string, name: string): Promise<WalkieResult<{ channelId: string }>> {
  if (!isVideoSdkConfigured()) return fail("Calling isn't set up yet. Ask your developer to configure it.");
  if (!(GROUP_KEYS as readonly string[]).includes(groupKey)) return fail("Choose a group.");
  const key = groupKey as GroupKey;
  const access = await groupAccessFor(userId);
  if (!access.some((a) => a.organizationId === organizationId && a.groupKey === key)) return fail("You're not part of that group.");

  await endExpired();
  const admin = createAdminClient();
  const { data: existing } = await admin.from("walkie_channels").select("id").eq("organization_id", organizationId).eq("group_key", key).eq("status", "live").maybeSingle();
  if (existing) return { ok: true, channelId: existing.id };

  let roomId: string;
  try {
    roomId = await createVideoSdkRoom();
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't start the channel.");
  }
  const title = name.trim().slice(0, 60) || `${GROUP_LABELS[key]} channel`;
  const { data: channel, error } = await admin
    .from("walkie_channels")
    .insert({ organization_id: organizationId, group_key: key, name: title, room_id: roomId, started_by: userId })
    .select("id")
    .single();
  if (error || !channel) {
    // Another person starting the same group's channel at the same moment wins; join theirs.
    const { data: winner } = await admin.from("walkie_channels").select("id").eq("organization_id", organizationId).eq("group_key", key).eq("status", "live").maybeSingle();
    return winner ? { ok: true, channelId: winner.id } : fail("Couldn't start the channel. Please try again.");
  }

  try {
    const recipients = (await resolveAudienceAuthIds(organizationId, { type: "group", groupKey: key })).filter((id) => id !== userId);
    await sendPushToUsers(recipients, "church_announcement", {
      title: `${title} is live`,
      body: `${GROUP_LABELS[key]} walkie-talkie has started. Tap to join.`,
      data: { type: "walkie_channel", channelId: channel.id, title },
    });
  } catch (err) {
    console.error("walkie start notification failed:", err);
  }
  return { ok: true, channelId: channel.id };
}

export async function joinChannel(userId: string, channelId: string, displayName: string): Promise<WalkieResult<{ roomId: string; token: string; displayName: string; name: string; groupLabel: string; canEnd: boolean }>> {
  const admin = createAdminClient();
  const { data: channel } = await admin.from("walkie_channels").select("*").eq("id", channelId).maybeSingle();
  if (!channel || !stillLive(channel)) return fail("This channel has ended.");
  const access = (await groupAccessFor(userId)).find((a) => a.organizationId === channel.organization_id && a.groupKey === channel.group_key);
  if (!access) return fail("You're not part of that group.");
  return {
    ok: true,
    roomId: channel.room_id,
    // A plain participant: no one on a channel can remove or mute another.
    token: generateParticipantToken(channel.room_id, ["allow_join"]),
    displayName,
    name: channel.name,
    groupLabel: GROUP_LABELS[channel.group_key],
    canEnd: access.isAdmin || channel.started_by === userId,
  };
}

export async function endChannel(userId: string, channelId: string): Promise<WalkieResult> {
  const admin = createAdminClient();
  const { data: channel } = await admin.from("walkie_channels").select("*").eq("id", channelId).maybeSingle();
  if (!channel || channel.status === "ended") return { ok: true };
  const access = (await groupAccessFor(userId)).find((a) => a.organizationId === channel.organization_id && a.groupKey === channel.group_key);
  if (!access || !(access.isAdmin || channel.started_by === userId)) return fail("Only the person who started it, or an admin, can end this channel.");
  await admin.from("walkie_channels").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", channelId);
  try {
    const recipients = (await resolveAudienceAuthIds(channel.organization_id, { type: "group", groupKey: channel.group_key as GroupKey })).filter((id) => id !== userId);
    await sendPushToUsers(recipients, "church_announcement", {
      title: `${channel.name} has ended`,
      body: `The ${GROUP_LABELS[channel.group_key as GroupKey]} walkie-talkie is over.`,
      data: { type: "walkie_ended", channelId },
    });
  } catch (err) {
    console.error("walkie end notification failed:", err);
  }
  return { ok: true };
}
