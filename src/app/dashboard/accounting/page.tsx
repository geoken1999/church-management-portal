import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, PiggyBank, ChevronRight } from "lucide-react";
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { href: "/dashboard/accounting/payroll", icon: Wallet, title: "Payroll", text: "Pay your pastors and staff each month. Paid salaries are added to your expenses." },
          { href: "/dashboard/accounting/budget", icon: PiggyBank, title: "Budget planner", text: "Plan monthly spending by category and see how you are doing against it." },
        ].map((card) => (
          <Link key={card.href} href={card.href} className="group flex items-start gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <card.icon className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-heading font-semibold">{card.title}</p>
              <p className="text-sm text-muted-foreground">{card.text}</p>
            </div>
            <ChevronRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
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
