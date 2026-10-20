import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// The waiting room used by the mobile app's call screen (migration 0162).
// A request older than this is stale: the person asks again.
const MAX_AGE_MINUTES = 30;
const freshAfter = () =>
  new Date(Date.now() - MAX_AGE_MINUTES * 60_000).toISOString();

export type EntryStatus = "pending" | "allowed" | "denied";

// The person's current request for a call: creates a pending one when there is
// none (or the old one is stale). A denied request stays denied until it goes stale.
export async function requestEntry(
  meetingId: string,
  userId: string,
  name: string,
): Promise<EntryStatus> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("kmeet_entry_requests")
    .select("id, status, created_at")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing && existing.created_at > freshAfter())
    return existing.status as EntryStatus;

  await admin.from("kmeet_entry_requests").upsert(
    {
      meeting_id: meetingId,
      user_id: userId,
      name,
      status: "pending",
      created_at: new Date().toISOString(),
      decided_at: null,
    },
    { onConflict: "meeting_id,user_id" },
  );
  return "pending";
}

export async function listPendingEntries(
  meetingId: string,
): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kmeet_entry_requests")
    .select("id, name")
    .eq("meeting_id", meetingId)
    .eq("status", "pending")
    .gt("created_at", freshAfter())
    .order("created_at", { ascending: true });
  return data ?? [];
}

// Answers a request. The caller has already checked they may moderate [meetingId].
export async function answerEntry(
  meetingId: string,
  requestId: string,
  decision: "allowed" | "denied",
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("kmeet_entry_requests")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("meeting_id", meetingId);
}

// The person stopped waiting.
export async function cancelEntry(
  meetingId: string,
  userId: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("kmeet_entry_requests")
    .delete()
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("status", "pending");
}

// The current answer to a person's request, without creating one: null when they
// have none (or it is stale).
export async function entryStatus(
  meetingId: string,
  userId: string,
): Promise<EntryStatus | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kmeet_entry_requests")
    .select("status, created_at")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();
  return data && data.created_at > freshAfter()
    ? (data.status as EntryStatus)
    : null;
}
