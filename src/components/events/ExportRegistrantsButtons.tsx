"use client";

import { useState, useTransition } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { exportEventRegistrants } from "@/lib/events/registrant-export";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

function downloadBase64(base64: string, mimeType: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Excel and PDF downloads of an event's registrants, from the Registrants tab.
export function ExportRegistrantsButtons({ eventId }: { eventId: string }) {
  const [pending, setPending] = useState<"excel" | "pdf" | null>(null);
  const [message, setMessage] = useState<{
    kind: "error" | "info";
    text: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  function handleExport(format: "excel" | "pdf") {
    setMessage(null);
    setPending(format);
    startTransition(async () => {
      const result = await exportEventRegistrants(eventId, format);
      setPending(null);
      if (
        result.error ||
        !result.base64 ||
        !result.filename ||
        !result.mimeType
      ) {
        setMessage({
          kind: "error",
          text: result.error ?? "Couldn't generate that file.",
        });
        return;
      }
      downloadBase64(result.base64, result.mimeType, result.filename);
      if (result.warning) setMessage({ kind: "info", text: result.warning });
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleExport("excel")}
          disabled={pending !== null}
        >
          <FileSpreadsheet className="size-3.5" />
          {pending === "excel" ? "Preparing..." : "Export Excel"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleExport("pdf")}
          disabled={pending !== null}
        >
          <FileDown className="size-3.5" />
          {pending === "pdf" ? "Preparing..." : "Export PDF"}
        </Button>
      </div>
      {message && (
        <Alert variant={message.kind === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
