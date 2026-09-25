import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getLedgerEntries } from "@/lib/accounting/dal";
import { resolvePeriodRange, ACCOUNTING_PERIOD_PRESETS, ACCOUNTING_PERIOD_LABELS, type AccountingPeriodPreset } from "@/lib/accounting/period";
import { PrintButton } from "@/components/accounting/PrintButton";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";

export const metadata: Metadata = {
  title: "Ledger | KingdomFlow",
};

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function LedgerPage({
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

  const [ledger, branches] = await Promise.all([
    getLedgerEntries(organizationId, range, selectedBranchId),
    getBranches(organizationId),
  ]);

  const branchName = selectedBranchId ? branches.find((branch) => branch.id === selectedBranchId)?.name : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/accounting" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to Accounting
        </Link>
        <PrintButton label="Print ledger" />
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">{membership.organization.name}</h1>
        <p className="text-lg font-medium">General Ledger</p>
        <p className="text-sm text-muted-foreground">
          {ACCOUNTING_PERIOD_LABELS[preset]} · {formatDate(range.start)} – {formatDate(range.end)}
          {branchName ? ` · ${branchName}` : " · All branches"}
        </p>
        <p className="text-xs text-muted-foreground">Generated {new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-foreground/20 text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Date</th>
            <th className="py-2 pr-2 font-medium">Description</th>
            <th className="py-2 pr-2 text-right font-medium">Income</th>
            <th className="py-2 pr-2 text-right font-medium">Expense</th>
            <th className="py-2 pl-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td colSpan={4} className="py-2 pr-2 text-muted-foreground italic">
              Opening balance
            </td>
            <td className="py-2 pl-2 text-right tabular-nums font-medium">{formatMoney(ledger.openingBalance)}</td>
          </tr>
          {ledger.entries.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted-foreground">
                No transactions in this period.
              </td>
            </tr>
          ) : (
            ledger.entries.map((entry, index) => (
              <tr key={index} className="border-b border-border/60">
                <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(entry.date)}</td>
                <td className="py-1.5 pr-2">{entry.description}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{entry.type === "income" ? formatMoney(entry.amount) : ""}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{entry.type === "expense" ? formatMoney(entry.amount) : ""}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{formatMoney(entry.balance)}</td>
              </tr>
            ))
          )}
          <tr className="border-t-2 border-foreground/20">
            <td colSpan={4} className="py-2 pr-2 font-medium">
              Closing balance
            </td>
            <td className="py-2 pl-2 text-right tabular-nums font-bold">{formatMoney(ledger.closingBalance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
