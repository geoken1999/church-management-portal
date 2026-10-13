import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMonthlyReport } from "@/lib/reports/monthly-dal";
import { MonthlyReportView } from "@/components/reports/MonthlyReportView";
import { ReportPhotosEditor } from "@/components/reports/ReportPhotosEditor";
import { PrintButton } from "@/components/reports/PrintButton";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Church report | KingdomFlow",
};

const photoUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/report-images/${path}`;

export default async function MonthlyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  if (!membership.tabAccess.reports.read) return <AccessRestricted label="Reports" />;

  const report = await getMonthlyReport(membership.organization.id, id);
  if (!report) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/reports?view=advanced" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All reports
        </Link>
        <PrintButton />
      </div>
      <MonthlyReportView data={report.data} note={report.note} photoUrl={photoUrl} />
      {membership.tabAccess.reports.write && <ReportPhotosEditor reportId={report.id} photos={report.data.photos ?? []} photoUrl={photoUrl} eventTitles={report.data.events?.list.map((e) => e.title) ?? []} />}
    </div>
  );
}
