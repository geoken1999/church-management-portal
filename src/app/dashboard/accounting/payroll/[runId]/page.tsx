import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getPayrollRun } from "@/lib/accounting/payroll-dal";
import { monthLabel } from "@/lib/accounting/payroll";
import { dateKeyInTimezone } from "@/lib/organizations/timezone";
import { PayrollRunManager } from "@/components/accounting/PayrollRunManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";

export const metadata: Metadata = {
  title: "Payroll | KingdomFlow",
};

export default async function PayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) return <UpgradeRequired label="Accounting" plan={plan.name} />;
  if (!membership.tabAccess.accounting.read) return <AccessRestricted label="Accounting" />;

  const data = await getPayrollRun(organizationId, runId);
  if (!data) notFound();

  const today = dateKeyInTimezone(new Date(), membership.organization.timezone || "Asia/Kolkata");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/accounting/payroll" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
          <ArrowLeft className="size-4" />
          Payroll
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
          {membership.organization.name} — payroll for {monthLabel(data.run.pay_month)}
        </h1>
      </div>
      <PayrollRunManager
        run={data.run}
        entries={data.entries}
        today={today}
        canWrite={membership.tabAccess.accounting.write}
        canDelete={membership.tabAccess.accounting.delete}
      />
    </div>
  );
}
