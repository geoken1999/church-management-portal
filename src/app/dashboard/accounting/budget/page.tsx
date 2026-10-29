import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getBudgetForMonth } from "@/lib/accounting/payroll-dal";
import { isMonthKey, monthOfDateKey } from "@/lib/accounting/payroll";
import { dateKeyInTimezone } from "@/lib/organizations/timezone";
import { BudgetManager } from "@/components/accounting/BudgetManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";

export const metadata: Metadata = {
  title: "Budget planner | KingdomFlow",
};

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: requested } = await searchParams;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) return <UpgradeRequired label="Accounting" plan={plan.name} />;
  if (!membership.tabAccess.accounting.read) return <AccessRestricted label="Accounting" />;

  const thisMonth = monthOfDateKey(dateKeyInTimezone(new Date(), membership.organization.timezone || "Asia/Kolkata"));
  const month = requested && isMonthKey(requested) ? requested : thisMonth;
  const { rows, uncategorised } = await getBudgetForMonth(organizationId, month);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/accounting" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Accounting
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">Budget planner</h1>
        <p className="mt-1 text-muted-foreground">Set what {membership.organization.name} plans to spend on each expense category, and watch it against what was actually spent.</p>
      </div>
      {/* Keyed by month so the inputs restart from the saved budget when the month changes. */}
      <BudgetManager key={month} organizationId={organizationId} month={month} rows={rows} uncategorised={uncategorised} canWrite={membership.tabAccess.accounting.write} />
    </div>
  );
}
