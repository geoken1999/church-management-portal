import { Download, FileText } from "lucide-react";
import { formatRupees } from "@/lib/billing/gst";
import type { PlatformInvoice } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Every tax invoice KingdomFlow has issued to this church, each downloadable as a PDF.
export function InvoicesCard({ invoices }: { invoices: PlatformInvoice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="size-4 text-primary" />
          Invoices
        </CardTitle>
        <CardDescription>A tax invoice is emailed to your billing email with every payment, and kept here.</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet. They appear after your first payment.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{invoice.invoice_number}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(invoice.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {invoice.line_items[0]?.description ?? "KingdomFlow"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{formatRupees(Number(invoice.total))}</span>
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/dashboard/billing/invoices/${invoice.id}`} />}>
                    <Download className="size-3.5" />
                    PDF
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
