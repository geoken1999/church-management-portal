"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CalendarClock, FileBarChart, Mail, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { deleteCustomReport, previewCustomReport, saveCustomReport, sendCustomReportNow, type CustomReportInput } from "@/lib/reports/custom-actions";
import { DATE_WINDOWS, FREQUENCIES, WEEKDAYS, scheduleSummary, type DateWindow, type Frequency } from "@/lib/reports/custom";
import type { ReportDefinition, ReportFilters } from "@/lib/reports/registry";
import type { Branch, CustomReport } from "@/types/database";
import { ReportFilterFields } from "@/components/reports/ReportsManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = (source: string): CustomReportInput => ({
  name: "",
  source,
  columns: [],
  filters: {},
  dateWindow: "all",
  format: "excel",
  frequency: "none",
  recipients: "",
});

const fromReport = (r: CustomReport): CustomReportInput => ({
  id: r.id,
  name: r.name,
  source: r.source,
  columns: r.columns,
  filters: r.filters,
  dateWindow: r.date_window,
  dateFrom: r.date_from ?? undefined,
  dateTo: r.date_to ?? undefined,
  format: r.format,
  frequency: r.frequency,
  scheduleDay: r.schedule_day ?? undefined,
  recipients: r.recipients.join(", "),
});

function Pick<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger size="sm" className={className ?? "w-44"}>
        <SelectValue>{options.find((o) => o.value === value)?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Builder({
  organizationId,
  sources,
  branches,
  initial,
  onDone,
}: {
  organizationId: string;
  sources: ReportDefinition[];
  branches: Branch[];
  initial: CustomReportInput;
  onDone: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [pending, start] = useTransition();
  const definition = sources.find((s) => s.id === form.source) ?? sources[0];
  const set = (patch: Partial<CustomReportInput>) => setForm((f) => ({ ...f, ...patch }));

  function changeSource(id: string) {
    setForm((f) => ({ ...f, source: id, columns: [], filters: {} }));
    setPreview(null);
  }

  function toggle(key: string, on: boolean) {
    set({ columns: on ? [...form.columns, key] : form.columns.filter((k) => k !== key) });
  }

  function move(key: string, delta: -1 | 1) {
    const i = form.columns.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= form.columns.length) return;
    const next = [...form.columns];
    [next[i], next[j]] = [next[j], next[i]];
    set({ columns: next });
  }

  function run(action: "preview" | "save") {
    setError(null);
    start(async () => {
      if (action === "preview") {
        const result = await previewCustomReport(organizationId, form);
        if (result.error) return setError(result.error);
        setPreview(result.rows ?? []);
        return;
      }
      const result = await saveCustomReport(organizationId, form);
      if (result.error) return setError(result.error);
      onDone();
    });
  }

  const dateless: ReportDefinition = { ...definition, filters: definition.filters.filter((f) => f.type !== "dateRange") };
  const hasDates = definition.filters.some((f) => f.type === "dateRange");
  const shownColumns = form.columns.map((k) => definition.columns.find((c) => c.key === k)).filter((c) => c !== undefined);

  return (
    <Card>
      <CardContent className="space-y-6">
        <ErrorToast message={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cr-name">Report name</Label>
            <Input id="cr-name" value={form.name} maxLength={80} placeholder="e.g. Monthly offerings by branch" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>What is it about?</Label>
            <Pick value={form.source} onChange={changeSource} options={sources.map((s) => ({ value: s.id, label: s.label }))} className="w-full" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Columns</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {definition.columns.map((column) => (
              <label key={column.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.columns.includes(column.key)} onCheckedChange={(c) => toggle(column.key, c === true)} />
                {column.label}
              </label>
            ))}
          </div>
          {shownColumns.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">Order:</span>
              {shownColumns.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-xs">
                  <button type="button" aria-label={`Move ${c.label} earlier`} onClick={() => move(c.key, -1)}>
                    <ArrowUp className="size-3" />
                  </button>
                  {c.label}
                  <button type="button" aria-label={`Move ${c.label} later`} onClick={() => move(c.key, 1)}>
                    <ArrowDown className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Filters</Label>
          <div className="flex flex-wrap items-end gap-3">
            <ReportFilterFields definition={dateless} filters={form.filters as ReportFilters} branches={branches} onChange={(next) => set({ filters: { branchId: next.branchId, status: next.status, method: next.method } })} />
            {hasDates && (
              <div className="space-y-1.5">
                <Label className="text-xs">Dates</Label>
                <Pick value={form.dateWindow} onChange={(v: DateWindow) => set({ dateWindow: v })} options={DATE_WINDOWS} />
              </div>
            )}
            {hasDates && form.dateWindow === "custom" && (
              <>
                <Input type="date" className="h-8 w-36" value={form.dateFrom ?? ""} onChange={(e) => set({ dateFrom: e.target.value || undefined })} aria-label="From" />
                <Input type="date" className="h-8 w-36" value={form.dateTo ?? ""} onChange={(e) => set({ dateTo: e.target.value || undefined })} aria-label="To" />
              </>
            )}
          </div>
          {hasDates && form.dateWindow !== "custom" && form.dateWindow !== "all" && <p className="text-xs text-muted-foreground">The dates move with the day it runs, so a scheduled report is always up to date.</p>}
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Email it on a schedule
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Pick value={form.frequency} onChange={(v: Frequency) => set({ frequency: v, scheduleDay: v === "weekly" || v === "monthly" ? 1 : undefined })} options={FREQUENCIES} />
            {form.frequency === "weekly" && <Pick value={String(form.scheduleDay ?? 1)} onChange={(v) => set({ scheduleDay: Number(v) })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />}
            {form.frequency === "monthly" && (
              <Pick value={String(form.scheduleDay ?? 1)} onChange={(v) => set({ scheduleDay: Number(v) })} options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }))} className="w-28" />
            )}
            <Pick value={form.format} onChange={(v: "excel" | "pdf") => set({ format: v })} options={[{ value: "excel", label: "Excel file" }, { value: "pdf", label: "PDF file" }]} className="w-32" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-to" className="text-xs">
              Send to (separate addresses with commas)
            </Label>
            <Input id="cr-to" value={form.recipients} placeholder="pastor@church.org, treasurer@church.org" onChange={(e) => set({ recipients: e.target.value })} />
          </div>
          {form.frequency !== "none" && <p className="text-xs text-muted-foreground">Goes out early each morning, India time, as an attachment.</p>}
        </div>

        {preview && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Preview: {preview.length}
              {preview.length === 200 ? "+" : ""} record{preview.length === 1 ? "" : "s"}
              {preview.length > 5 ? ", first 5 shown" : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {shownColumns.map((c) => (
                      <th key={c.key} className="px-3 py-2 font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      {shownColumns.map((c) => (
                        <td key={c.key} className="px-3 py-2">
                          {row[c.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => run("preview")} disabled={pending}>
            <Play className="size-3.5" /> Preview
          </Button>
          <Button type="button" onClick={() => run("save")} disabled={pending}>
            {pending ? "Saving..." : form.id ? "Save changes" : "Save report"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomReportsPanel({
  organizationId,
  reports,
  sources,
  branches,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  reports: CustomReport[];
  sources: ReportDefinition[];
  branches: Branch[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<CustomReportInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  function act(id: string, task: () => Promise<{ error?: string; sentTo?: string[] }>) {
    setError(null);
    setMessage(null);
    setBusy(id);
    start(async () => {
      const result = await task();
      setBusy(null);
      if (result.error) setError(result.error);
      else if (result.sentTo) setMessage(`Sent to ${result.sentTo.join(", ")}.`);
    });
  }

  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Ask an admin to grant you read access to a data module (Members, Attendance, Events, Offerings or Donations) to build reports from it.</CardContent>
      </Card>
    );
  }

  if (editing) {
    return <Builder key={editing.id ?? "new"} organizationId={organizationId} sources={sources} branches={branches} initial={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Pick the columns and filters you want, save it, and have it emailed on a schedule.</p>
        {canWrite && (
          <Button type="button" onClick={() => setEditing(EMPTY(sources[0].id))}>
            <Plus className="size-4" /> New report
          </Button>
        )}
      </div>
      {message && <p className="text-sm text-primary">{message}</p>}

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileBarChart className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No custom reports yet.</p>
          </CardContent>
        </Card>
      ) : (
        reports.map((report) => {
          const label = sources.find((s) => s.id === report.source)?.label ?? report.source;
          const editable = canWrite && sources.some((s) => s.id === report.source);
          return (
            <Card key={report.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{report.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {label} · {report.columns.length} column{report.columns.length === 1 ? "" : "s"} · {DATE_WINDOWS.find((w) => w.value === report.date_window)?.label}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {scheduleSummary(report)}
                    {report.frequency !== "none" && ` · ${report.format === "pdf" ? "PDF" : "Excel"} to ${report.recipients.length} address${report.recipients.length === 1 ? "" : "es"}`}
                  </p>
                  {report.last_status && report.last_run_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Last run {new Date(report.last_run_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: {report.last_status}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {editable && (
                    <Button type="button" size="sm" variant="outline" disabled={busy === report.id} onClick={() => act(report.id, () => sendCustomReportNow(organizationId, report.id))}>
                      <Mail className="size-3.5" /> {busy === report.id ? "Sending..." : "Send now"}
                    </Button>
                  )}
                  {editable && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(fromReport(report))}>
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === report.id}
                      onClick={() => {
                        if (window.confirm(`Delete "${report.name}"? Its schedule stops too.`)) act(report.id, () => deleteCustomReport(organizationId, report.id));
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
