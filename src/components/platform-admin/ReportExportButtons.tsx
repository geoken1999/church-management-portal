"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, FileDown } from "lucide-react";
import type { ExportReportResult } from "@/lib/platform-admin/report-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

// Same download mechanics as the org-facing ReportsManager
// (src/components/reports/ReportsManager.tsx) — kept as its own small
// component rather than importing that one, since this is parameterized
// by whichever platform-admin export action the caller passes in
// (exportTenantsReport vs. exportTenantReport) instead of a fixed
// (organizationId, reportId, filters) signature.
export function ReportExportButtons({ onExport }: { onExport: (format: "excel" | "pdf") => Promise<ExportReportResult> }) {
  const [pending, setPending] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleExport(format: "excel" | "pdf") {
    setError(null);
    setPending(format);
    startTransition(async () => {
      const result = await onExport(format);
      setPending(null);
      if (result.error || !result.base64 || !result.filename || !result.mimeType) {
        setError(result.error ?? "Couldn't generate that file.");
        return;
      }
      downloadFile(result.base64, result.mimeType, result.filename);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => handleExport("excel")} disabled={pending !== null}>
          <FileSpreadsheet className="size-3.5" />
          {pending === "excel" ? "Preparing..." : "Export Excel"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => handleExport("pdf")} disabled={pending !== null}>
          <FileDown className="size-3.5" />
          {pending === "pdf" ? "Preparing..." : "Export PDF"}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
