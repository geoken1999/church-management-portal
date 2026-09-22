import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReportFilters, ReportId } from "@/lib/reports/registry";
import type { MemberStatus, DonationMethod } from "@/types/database";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Every report returns display-ready string cells keyed by its column
// definitions — the same shape powers the on-screen table, the Excel
// sheet, and the PDF table, so formatting only happens once per report.
export async function getReportRows(organizationId: string, reportId: ReportId, filters: ReportFilters): Promise<Record<string, string>[]> {
  const supabase = await createClient();

  switch (reportId) {
    case "members": {
      let query = supabase
        .from("members")
        .select("first_name, last_name, email, phone, status, date_of_birth, created_at, branches!members_branch_id_fkey(name)")
        .eq("organization_id", organizationId)
        .order("last_name", { ascending: true });
      if (filters.branchId) query = query.eq("branch_id", filters.branchId);
      if (filters.status) query = query.eq("status", filters.status as MemberStatus);
      if (filters.from) query = query.gte("created_at", filters.from);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59`);

      const { data } = await query;
      return (data ?? []).map((row) => ({
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email ?? "",
        phone: row.phone ?? "",
        status: row.status,
        branch: row.branches?.name ?? "",
        dateOfBirth: formatDate(row.date_of_birth),
        joined: formatDate(row.created_at.slice(0, 10)),
      }));
    }

    case "attendance": {
      let query = supabase
        .from("attendance_sessions")
        .select("title, occurrence_date, headcount, branches(name), events(title), attendance_records(count)")
        .eq("organization_id", organizationId)
        .order("occurrence_date", { ascending: false });
      if (filters.branchId) query = query.eq("branch_id", filters.branchId);
      if (filters.from) query = query.gte("occurrence_date", filters.from);
      if (filters.to) query = query.lte("occurrence_date", filters.to);

      const { data } = await query;
      return (data ?? []).map((row) => ({
        date: formatDate(row.occurrence_date),
        title: row.title,
        branch: row.branches?.name ?? "All branches",
        event: row.events?.title ?? "",
        presentCount: String(row.attendance_records?.[0]?.count ?? 0),
        headcount: row.headcount != null ? String(row.headcount) : "",
      }));
    }

    case "events": {
      let query = supabase
        .from("events")
        .select("title, start_at, meeting_mode, is_recurring, recurrence_frequency, branches(name)")
        .eq("organization_id", organizationId)
        .order("start_at", { ascending: false });
      if (filters.branchId) query = query.eq("branch_id", filters.branchId);
      if (filters.from) query = query.gte("start_at", filters.from);
      if (filters.to) query = query.lte("start_at", `${filters.to}T23:59:59`);

      const { data } = await query;
      return (data ?? []).map((row) => ({
        title: row.title,
        date: formatDateTime(row.start_at),
        branch: row.branches?.name ?? "All branches",
        mode: row.meeting_mode === "online" ? "Online" : "In-person",
        recurrence: row.is_recurring ? (row.recurrence_frequency ?? "Recurring") : "One-time",
      }));
    }

    case "offerings": {
      let query = supabase
        .from("offerings")
        .select("collected_on, category, amount, notes, branches(name)")
        .eq("organization_id", organizationId)
        .order("collected_on", { ascending: false });
      if (filters.branchId) query = query.eq("branch_id", filters.branchId);
      if (filters.from) query = query.gte("collected_on", filters.from);
      if (filters.to) query = query.lte("collected_on", filters.to);

      const { data } = await query;
      return (data ?? []).map((row) => ({
        date: formatDate(row.collected_on),
        category: row.category,
        amount: formatMoney(row.amount),
        branch: row.branches?.name ?? "All branches",
        notes: row.notes ?? "",
      }));
    }

    case "donations": {
      let query = supabase
        .from("donations")
        .select("donated_on, donor_name, amount, method, notes, members(first_name, last_name), fundraisers(title)")
        .eq("organization_id", organizationId)
        .order("donated_on", { ascending: false });
      if (filters.method) query = query.eq("method", filters.method as DonationMethod);
      if (filters.from) query = query.gte("donated_on", filters.from);
      if (filters.to) query = query.lte("donated_on", filters.to);

      const { data } = await query;
      return (data ?? []).map((row) => ({
        date: formatDate(row.donated_on),
        donor: row.members ? `${row.members.first_name} ${row.members.last_name}` : (row.donor_name ?? "Anonymous"),
        amount: formatMoney(row.amount),
        method: row.method,
        fundraiser: row.fundraisers?.title ?? "",
        notes: row.notes ?? "",
      }));
    }

    default:
      return [];
  }
}
