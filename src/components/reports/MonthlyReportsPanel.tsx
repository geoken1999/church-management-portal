"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileBarChart, Eye, Trash2, Smartphone } from "lucide-react";
import { deleteMonthlyReportAction, generateMonthlyReportAction, setMonthlyReportPublishedAction } from "@/lib/reports/monthly-actions";
import { MONTHLY_SECTIONS, periodLabel } from "@/lib/reports/monthly";
import type { SavedMonthlyReport } from "@/lib/reports/monthly-dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function MonthlyReportsPanel({
  reports,
  allowedSections,
  canWrite,
  canDelete,
  canPublish,
  latestFinishedMonth,
}: {
  reports: SavedMonthlyReport[];
  allowedSections: string[];
  canWrite: boolean;
  canDelete: boolean;
  canPublish: boolean;
  latestFinishedMonth: string;
}) {
  const [period, setPeriod] = useState(latestFinishedMonth);
  const [sections, setSections] = useState<string[]>(allowedSections);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: string) {
    setSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function generate() {
    setMessage(null);
    startTransition(async () => {
      const result = await generateMonthlyReportAction({ period, sections, note });
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: `The ${periodLabel(period)} report is ready below.` });
    });
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="size-4 text-primary" />
              Make a monthly report
            </CardTitle>
            <CardDescription>
              A summary of how the church did in one finished month, from your own records. Totals only: it never shows who gave what. Making a report for a month that already has one replaces
              it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && (
              <Alert variant={message.kind === "error" ? "destructive" : "default"}>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="period">Month</Label>
                <Input id="period" type="month" value={period} max={latestFinishedMonth} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>What to include</Label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {MONTHLY_SECTIONS.filter((s) => allowedSections.includes(s.key)).map((s) => (
                    <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={sections.includes(s.key)} onCheckedChange={() => toggle(s.key)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">A note from you (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} rows={3} placeholder="A word of thanks, praise reports, what's coming next month..." />
            </div>
            <Button type="button" onClick={generate} disabled={pending || sections.length === 0 || !period}>
              {pending ? "Making the report..." : "Make report"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-bold">Monthly reports</h2>
        {reports.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No monthly reports yet.</CardContent>
          </Card>
        ) : (
          reports.map((report) => <ReportRow key={report.id} report={report} canDelete={canDelete} canPublish={canPublish} />)
        )}
      </div>
    </div>
  );
}

function ReportRow({ report, canDelete, canPublish }: { report: SavedMonthlyReport; canDelete: boolean; canPublish: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{report.title}</span>
            {report.published ? (
              <Badge className="gap-1">
                <Smartphone className="size-3" />
                Shown to members in the app
              </Badge>
            ) : (
              <Badge variant="secondary">Not published</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Made {new Date(report.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {report.data.sections?.length ?? 0} sections
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/reports/monthly/${report.id}`} />}>
            <Eye className="size-3.5" />
            View
          </Button>
          {canPublish && (
            <Button
              type="button"
              size="sm"
              variant={report.published ? "outline" : "default"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setMonthlyReportPublishedAction(report.id, !report.published);
                  setError(result.error ?? null);
                })
              }
            >
              {report.published ? "Unpublish" : "Publish to the app"}
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Delete the ${report.title}?`)) return;
                startTransition(async () => {
                  const result = await deleteMonthlyReportAction(report.id);
                  setError(result.error ?? null);
                });
              }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
