import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getInvoice } from "@/lib/accounting/dal";
import { PrintButton } from "@/components/accounting/PrintButton";
import { Badge } from "@/components/ui/badge";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import type { InvoiceStatus } from "@/types/database";

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_VARIANTS: Record<InvoiceStatus, "default" | "secondary" | "destructive"> = {
  unpaid: "default",
  paid: "secondary",
  cancelled: "destructive",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const membership = await requireOrganization();
  const result = await getInvoice(membership.organization.id, id);
  return { title: result ? `${result.invoice.invoice_number} | KingdomFlow` : "Invoice | KingdomFlow" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) {
    return <UpgradeRequired label="Accounting" plan={plan.name} />;
  }
  if (!membership.tabAccess.accounting.read) {
    return <AccessRestricted label="Accounting" />;
  }

  const result = await getInvoice(organizationId, id);
  if (!result) {
    notFound();
  }
  const { invoice, items } = result;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6 print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/accounting" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to Accounting
        </Link>
        <PrintButton />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{membership.organization.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invoice</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-xl font-bold">{invoice.invoice_number}</p>
          <Badge variant={STATUS_VARIANTS[invoice.status]}>{invoice.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 border-y border-border py-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Bill to</p>
          <p className="mt-1 font-medium">{invoice.bill_to_name}</p>
          {invoice.bill_to_email && <p className="text-muted-foreground">{invoice.bill_to_email}</p>}
          {invoice.bill_to_address && <p className="whitespace-pre-line text-muted-foreground">{invoice.bill_to_address}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="text-muted-foreground">Issue date: </span>
            {formatDate(invoice.issue_date)}
          </p>
          {invoice.due_date && (
            <p>
              <span className="text-muted-foreground">Due date: </span>
              {formatDate(invoice.due_date)}
            </p>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-foreground/20 text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Description</th>
            <th className="py-2 px-2 text-right font-medium">Qty</th>
            <th className="py-2 px-2 text-right font-medium">Unit price</th>
            <th className="py-2 pl-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border/60">
              <td className="py-2 pr-2">{item.description}</td>
              <td className="py-2 px-2 text-right tabular-nums">{item.quantity}</td>
              <td className="py-2 px-2 text-right tabular-nums">{formatMoney(item.unit_price)}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatMoney(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({invoice.tax_rate}%)</span>
            <span className="tabular-nums">{formatMoney(invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(invoice.total)}</span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <div className="border-t border-border pt-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
