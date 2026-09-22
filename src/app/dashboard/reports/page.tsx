import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { ReportsManager } from "@/components/reports/ReportsManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Reports | KingdomFlow",
};

export default async function ReportsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.reports.read) {
    return <AccessRestricted label="Reports" />;
  }

  const branches = await getBranches(organizationId);

  // Only surface reports whose underlying data module the user can
  // actually read — access to Reports itself doesn't imply access to
  // every module a report might draw from.
  const availableReports = REPORT_DEFINITIONS.filter((definition) => membership.tabAccess[definition.tab]?.read);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-muted-foreground">Filter and view your data, then export it to Excel or PDF.</p>
      </div>

      <ReportsManager organizationId={organizationId} reports={availableReports} branches={branches} />
    </div>
  );
}
