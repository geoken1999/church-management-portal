import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getAttendanceSessions = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_sessions")
    .select("*, branches(id, name), events(id, title), attendance_records(count)")
    .eq("organization_id", organizationId)
    .order("occurrence_date", { ascending: false });

  return data ?? [];
});

export const getAttendanceSession = cache(async (organizationId: string, sessionId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_sessions")
    .select("*, branches(id, name), events(id, title, registration_enabled)")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  return data;
});

export const getAttendanceRecords = cache(async (sessionId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("attendance_records").select("member_id").eq("session_id", sessionId);

  return data?.map((record) => record.member_id) ?? [];
});

// The check-in roster for a session: active members, scoped to the
// session's branch when it has one, otherwise every active member in the
// org (an org-wide session, e.g. a churchwide event with no single branch).
export const getAttendanceRoster = cache(async (organizationId: string, branchId: string | null) => {
  const supabase = await createClient();
  let query = supabase
    .from("members")
    .select("id, first_name, last_name, branches!members_branch_id_fkey(id, name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("first_name", { ascending: true });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data } = await query;
  return data ?? [];
});
