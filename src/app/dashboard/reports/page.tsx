import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { ReportsManager } from "@/components/reports/ReportsManager";
import { MonthlyReportsPanel } from "@/components/reports/MonthlyReportsPanel";
import { getMonthlyReports } from "@/lib/reports/monthly-dal";
import { MONTHLY_SECTIONS, periodOf } from "@/lib/reports/monthly";
import { Button } from "@/components/ui/button";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Reports | KingdomFlow",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.reports.read) {
    return <AccessRestricted label="Reports" />;
  }

  const advanced = view === "advanced";
  const branches = advanced ? [] : await getBranches(organizationId);

  // Only surface reports whose underlying data module the user can
  // actually read — access to Reports itself doesn't imply access to
  // every module a report might draw from.
  const availableReports = REPORT_DEFINITIONS.filter((definition) => membership.tabAccess[definition.tab]?.read);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-muted-foreground">
          {advanced ? "A monthly report of the whole church, which you can show to your members in the app." : "Filter and view your data, then export it to Excel or PDF."}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant={advanced ? "outline" : "default"} nativeButton={false} render={<Link href="/dashboard/reports">Standard reports</Link>} />
        <Button variant={advanced ? "default" : "outline"} nativeButton={false} render={<Link href="/dashboard/reports?view=advanced">Advanced: monthly report</Link>} />
      </div>

      {advanced ? (
        <MonthlyReportsPanel
          reports={await getMonthlyReports(organizationId)}
          allowedSections={MONTHLY_SECTIONS.filter((s) => (s.key === "giving" ? membership.tabAccess.offerings.read && membership.tabAccess.donations.read : membership.tabAccess[s.tab].read)).map((s) => s.key)}
          canWrite={membership.tabAccess.reports.write}
          canDelete={membership.tabAccess.reports.delete}
          canPublish={membership.role === "owner" || membership.role === "admin"}
          latestFinishedMonth={periodOf(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))}
        />
      ) : (
        <ReportsManager organizationId={organizationId} reports={availableReports} branches={branches} />
      )}
    </div>
  );
}
