"use client";

import { useMemo, useState, useTransition } from "react";
import { FileBarChart, FileSpreadsheet, FileDown, Play } from "lucide-react";
import { runReport, exportReport } from "@/lib/reports/actions";
import type { ReportDefinition, ReportFilters, ReportId } from "@/lib/reports/registry";
import type { Branch } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([byteNumbers], { type: mimeType });
}

function downloadFile(base64: string, mimeType: string, filename: string) {
  const blob = base64ToBlob(base64, mimeType);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportFilterFields({
  definition,
  filters,
  branches,
  onChange,
}: {
  definition: ReportDefinition;
  filters: ReportFilters;
  branches: Branch[];
  onChange: (next: ReportFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {definition.filters.map((field) => {
        if (field.type === "dateRange") {
          return (
            <div key={field.key} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${field.key}-from`} className="text-xs">
                  {field.label} from
                </Label>
                <Input
                  id={`${field.key}-from`}
                  type="date"
                  className="h-8 w-36"
                  value={filters.from ?? ""}
                  onChange={(event) => onChange({ ...filters, from: event.target.value || undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${field.key}-to`} className="text-xs">
                  to
                </Label>
                <Input
                  id={`${field.key}-to`}
                  type="date"
                  className="h-8 w-36"
                  value={filters.to ?? ""}
                  onChange={(event) => onChange({ ...filters, to: event.target.value || undefined })}
                />
              </div>
            </div>
          );
        }

        if (field.type === "branch") {
          const value = filters.branchId ?? "all";
          return (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs">{field.label}</Label>
              <Select value={value} onValueChange={(next) => onChange({ ...filters, branchId: next && next !== "all" ? next : undefined })}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="All branches">{value === "all" ? "All branches" : (branches.find((b) => b.id === value)?.name ?? "All branches")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        // "select" — currently only used for members.status and
        // donations.method, so filters[field.key] doubles as the storage
        // slot; both keys live on ReportFilters.
        const key = field.key as "status" | "method";
        const value = filters[key] ?? "all";
        const selectedOption = field.options?.find((option) => option.value === value);
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-xs">{field.label}</Label>
            <Select value={value} onValueChange={(next) => onChange({ ...filters, [key]: next && next !== "all" ? next : undefined })}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue placeholder={`All ${field.label.toLowerCase()}`}>{value === "all" ? `All ${field.label.toLowerCase()}` : (selectedOption?.label ?? value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {field.label.toLowerCase()}</SelectItem>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

function ReportTable({ definition, rows }: { definition: ReportDefinition; rows: Record<string, string>[] }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No records match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {definition.columns.map((column) => (
              <th key={column.key} className={`px-3 py-2 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border/60 last:border-0">
              {definition.columns.map((column) => (
                <td key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                  {row[column.key] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsManager({
  organizationId,
  reports,
  branches,
}: {
  organizationId: string;
  reports: ReportDefinition[];
  branches: Branch[];
}) {
  const [selectedId, setSelectedId] = useState<ReportId | undefined>(reports[0]?.id);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runPending, startRun] = useTransition();
  const [exportingFormat, setExportingFormat] = useState<"excel" | "pdf" | null>(null);
  const [, startExport] = useTransition();

  const definition = useMemo(() => reports.find((report) => report.id === selectedId), [reports, selectedId]);

  function handleSelectReport(id: string) {
    setSelectedId(id as ReportId);
    setFilters({});
    setRows(null);
    setError(null);
  }

  function handleRun() {
    if (!definition) return;
    setError(null);
    startRun(async () => {
      const result = await runReport(organizationId, definition.id, filters);
      if (result.error) {
        setError(result.error);
        setRows(null);
        return;
      }
      setRows(result.rows ?? []);
    });
  }

  function handleExport(format: "excel" | "pdf") {
    if (!definition) return;
    setError(null);
    setExportingFormat(format);
    startExport(async () => {
      const result = await exportReport(organizationId, definition.id, filters, format);
      setExportingFormat(null);
      if (result.error || !result.base64 || !result.filename || !result.mimeType) {
        setError(result.error ?? "Couldn't generate that file.");
        return;
      }
      downloadFile(result.base64, result.mimeType, result.filename);
    });
  }

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <FileBarChart className="size-8 text-muted-foreground" />
          <div>
            <h3 className="font-heading text-base font-bold">No reports available</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Ask an admin to grant you read access to at least one data module (Members, Attendance, Events, Offerings, or Donations).
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {reports.map((report) => (
          <Button
            key={report.id}
            type="button"
            size="sm"
            variant={report.id === selectedId ? "default" : "outline"}
            onClick={() => handleSelectReport(report.id)}
          >
            {report.label}
          </Button>
        ))}
      </div>

      {definition && (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{definition.description}</p>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <ReportFilterFields definition={definition} filters={filters} branches={branches} onChange={setFilters} />
              <Button type="button" size="sm" onClick={handleRun} disabled={runPending}>
                <Play className="size-3.5" />
                {runPending ? "Running..." : "Run report"}
              </Button>
            </div>

            {rows !== null && (
              <>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    {rows.length} record{rows.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleExport("excel")} disabled={exportingFormat !== null}>
                      <FileSpreadsheet className="size-3.5" />
                      {exportingFormat === "excel" ? "Preparing..." : "Export Excel"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleExport("pdf")} disabled={exportingFormat !== null}>
                      <FileDown className="size-3.5" />
                      {exportingFormat === "pdf" ? "Preparing..." : "Export PDF"}
                    </Button>
                  </div>
                </div>
                <ReportTable definition={definition} rows={rows} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
