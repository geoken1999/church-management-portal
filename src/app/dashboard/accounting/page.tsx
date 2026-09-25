import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getAccountingSummary, getExpenses, getAccountingCategories, getInvoices } from "@/lib/accounting/dal";
import { resolvePeriodRange, ACCOUNTING_PERIOD_PRESETS, type AccountingPeriodPreset } from "@/lib/accounting/period";
import { AccountingManager } from "@/components/accounting/AccountingManager";
import { InvoicesManager } from "@/components/accounting/InvoicesManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";

export const metadata: Metadata = {
  title: "Accounting | KingdomFlow",
};

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; branchId?: string; start?: string; end?: string }>;
}) {
  const { period, branchId, start, end } = await searchParams;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) {
    return <UpgradeRequired label="Accounting" plan={plan.name} />;
  }

  if (!membership.tabAccess.accounting.read) {
    return <AccessRestricted label="Accounting" />;
  }

  const preset: AccountingPeriodPreset = (ACCOUNTING_PERIOD_PRESETS as readonly string[]).includes(period ?? "")
    ? (period as AccountingPeriodPreset)
    : "month";
  const range = resolvePeriodRange(preset, { start, end });
  const selectedBranchId = branchId || undefined;

  const [summary, expenses, categories, branches, invoices] = await Promise.all([
    getAccountingSummary(organizationId, range, selectedBranchId),
    getExpenses(organizationId, selectedBranchId),
    getAccountingCategories(organizationId),
    getBranches(organizationId),
    getInvoices(organizationId),
  ]);

  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="mt-1 text-muted-foreground">
          Income and expenses for {membership.organization.name}, by branch and by period.
        </p>
      </div>

      <AccountingManager
        organizationId={organizationId}
        summary={summary}
        expenses={expenses}
        categories={categories}
        branches={branchOptions}
        preset={preset}
        rangeStart={range.start}
        rangeEnd={range.end}
        selectedBranchId={selectedBranchId ?? ""}
        canWrite={membership.tabAccess.accounting.write}
        canDelete={membership.tabAccess.accounting.delete}
      />

      <InvoicesManager
        organizationId={organizationId}
        invoices={invoices}
        branches={branchOptions}
        canWrite={membership.tabAccess.accounting.write}
        canDelete={membership.tabAccess.accounting.delete}
      />
    </div>
  );
}
