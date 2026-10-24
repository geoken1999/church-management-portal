import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getPaidButNotEnrolled } from "@/lib/lms/unenrolled";
import { RetryEnrolmentButton } from "@/components/platform-admin/RetryEnrolmentButton";
import { Card, CardContent } from "@/components/ui/card";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";

export const metadata: Metadata = { title: "Paid, not enrolled | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function UnenrolledPaymentsPage() {
  await requirePlatformAdmin();
  const orders = await getPaidButNotEnrolled();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Paid, not enrolled</h1>
        <p className="mt-1 text-muted-foreground">
          Bible School program fees that were paid but whose student isn&apos;t in the program. The money was taken and the enrolment failed. Enrol now tries it again; if it still fails the reason is shown, and the details
          are in Logs under bible_school_payment.
        </p>
      </div>
      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Every paid program order has its student enrolled.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{o.churchName}</p>
                  <p className="font-heading text-base font-bold">{o.payerName}</p>
                  <p className="text-sm">
                    {o.programTitle} · ₹{o.amount.toLocaleString("en-IN")} · paid {o.paidAt ? formatPlatformDateTime(o.paidAt) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[o.payerPhone, o.payerEmail].filter(Boolean).join(" · ")} · {o.kind === "application" ? "outside student" : "church member"}
                  </p>
                  <p className="text-xs text-destructive">{o.reason}</p>
                </div>
                <RetryEnrolmentButton orderId={o.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
