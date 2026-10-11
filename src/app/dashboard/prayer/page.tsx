import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { PrayerRequestsView, type PrayerRow } from "@/components/prayer/PrayerRequestsView";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Prayer | KingdomFlow",
};

export default async function PrayerPage() {
  const membership = await requireOrganization();

  if (!membership.tabAccess.prayer.read) {
    return <AccessRestricted label="Prayer" />;
  }

  // Read-only: members raise requests from the mobile app. The team sees who
  // sent each one (even an anonymous-to-members request) so they can follow up.
  const supabase = await createClient();
  const { data } = await supabase
    .from("prayer_requests")
    .select("id, request, visibility, is_anonymous, status, answered_at, created_at, members(first_name, last_name, phone)")
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows: PrayerRow[] = (data ?? []).map((row) => ({
    id: row.id,
    request: row.request,
    visibility: row.visibility,
    isAnonymous: row.is_anonymous,
    status: row.status,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    memberName: row.members ? `${row.members.first_name} ${row.members.last_name}` : "A member",
    memberPhone: row.members?.phone ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Prayer</h1>
        <p className="mt-1 text-muted-foreground">
          Prayer requests your members raise in the mobile app. This is a read-only view: members add and close their own requests, and your team is notified of each new one.
        </p>
      </div>

      <PrayerRequestsView rows={rows} organizationTimezone={membership.organization.timezone} />
    </div>
  );
}
