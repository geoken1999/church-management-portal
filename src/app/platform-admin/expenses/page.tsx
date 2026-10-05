import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getPlatformExpensesReport } from "@/lib/platform-admin/finance";
import { platformServiceLabel } from "@/lib/platform-admin/finance-config";
import { RecordExpenseDialog } from "@/components/platform-admin/RecordExpenseDialog";
import { DeleteExpenseButton } from "@/components/platform-admin/DeleteExpenseButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";

export const metadata: Metadata = {
  title: "Expenses | KingdomFlow",
};

function money(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function PlatformExpensesPage() {
  await requirePlatformAdmin();
  const report = await getPlatformExpensesReport();
  const today = dateKeyInTimezone(new Date(), DEFAULT_TIMEZONE);

  return (
    <div className="max-w-5xl space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="mt-1 text-muted-foreground">
            Bills for the services KingdomFlow runs on. Record each payment when it&apos;s made. The last-paid date for each service shows at a
            glance whether anything has been missed.
          </p>
        </div>
        <RecordExpenseDialog today={today} />
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">By service</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {report.services.map((service) => (
            <Card key={service.key}>
              <CardHeader>
                <CardTitle className="text-base">{service.label}</CardTitle>
                <CardDescription>
                  {service.lastPaidOn ? `Last paid ${dateLabel(service.lastPaidOn)}` : "Never recorded"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Last 12 months: {money(service.last12Months)}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Payments</h2>
        {report.rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No expenses recorded yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Paid on</th>
                    <th className="px-4 py-2 font-medium">Service</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium">Vendor / ref</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{dateLabel(row.paid_on)}</td>
                      <td className="px-4 py-2">{platformServiceLabel(row.service)}</td>
                      <td className="px-4 py-2">{row.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">{[row.vendor, row.reference].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(Number(row.amount))}</td>
                      <td className="px-4 py-2 text-right">
                        <DeleteExpenseButton expenseId={row.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
