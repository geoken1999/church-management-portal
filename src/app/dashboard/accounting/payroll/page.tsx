import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getPayrollEmployees, getPayrollRuns } from "@/lib/accounting/payroll-dal";
import { monthOfDateKey } from "@/lib/accounting/payroll";
import { dateKeyInTimezone } from "@/lib/organizations/timezone";
import { PayrollManager } from "@/components/accounting/PayrollManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";

export const metadata: Metadata = {
  title: "Payroll | KingdomFlow",
};

export default async function PayrollPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) return <UpgradeRequired label="Accounting" plan={plan.name} />;
  if (!membership.tabAccess.accounting.read) return <AccessRestricted label="Accounting" />;

  const [employees, runs, branches] = await Promise.all([getPayrollEmployees(organizationId), getPayrollRuns(organizationId), getBranches(organizationId)]);
  const currentMonth = monthOfDateKey(dateKeyInTimezone(new Date(), membership.organization.timezone || "Asia/Kolkata"));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/accounting" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Accounting
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">Payroll</h1>
        <p className="mt-1 text-muted-foreground">Salaries for {membership.organization.name}&apos;s pastors and staff. Paying a month adds the salaries to Accounting.</p>
      </div>
      <PayrollManager
        organizationId={organizationId}
        employees={employees}
        runs={runs}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        currentMonth={currentMonth}
        canWrite={membership.tabAccess.accounting.write}
        canDelete={membership.tabAccess.accounting.delete}
      />
    </div>
  );
}
