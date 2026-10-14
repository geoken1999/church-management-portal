import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadInvoiceTemplate } from "@/lib/invoices/template-store";
import { formatRupees } from "@/lib/billing/gst";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";
import { InvoiceTemplateEditor } from "@/components/platform-admin/InvoiceTemplateEditor";
import { ResendInvoiceButton } from "@/components/platform-admin/ResendInvoiceButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Invoice template | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

export default async function InvoiceTemplatePage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const [template, { data: invoices }] = await Promise.all([
    loadInvoiceTemplate(),
    admin.from("platform_invoices").select("id, invoice_number, issued_at, total, kind, buyer, email_sent_at, email_error, organization_id").order("issued_at", { ascending: false }).limit(50),
  ]);
  const orgIds = [...new Set((invoices ?? []).map((i) => i.organization_id))];
  const { data: orgs } = orgIds.length ? await admin.from("organizations").select("id, name").in("id", orgIds) : { data: [] };
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Invoice template</h1>
        <p className="mt-1 text-muted-foreground">Design the tax invoice every church receives by email after paying for a plan or an add-on pack, with 18% GST added to the price.</p>
      </div>

      <InvoiceTemplateEditor initial={template} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Issued invoices</CardTitle>
          <CardDescription>The latest 50. Resend one if the buyer didn&apos;t get it.</CardDescription>
        </CardHeader>
        <CardContent>
          {(invoices ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. They appear as churches pay.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Church</th>
                    <th className="py-2 pr-4">Issued</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).map((invoice) => (
                    <tr key={invoice.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{invoice.invoice_number}</td>
                      <td className="py-2 pr-4">{orgName.get(invoice.organization_id) ?? "Unknown church"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatPlatformDateTime(invoice.issued_at)}</td>
                      <td className="py-2 pr-4">{formatRupees(Number(invoice.total))}</td>
                      <td className="py-2 pr-4">
                        {invoice.email_sent_at ? <Badge variant="secondary">Sent</Badge> : <Badge variant="destructive" title={invoice.email_error ?? ""}>Not sent</Badge>}
                      </td>
                      <td className="flex gap-2 py-2">
                        <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/platform-admin/invoice-template/${invoice.id}`} />}>
                          <Download className="size-3.5" />
                          PDF
                        </Button>
                        <ResendInvoiceButton id={invoice.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
