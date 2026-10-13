"use client";

import { useEffect } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// The PDF is made by the browser's own print engine, so Tamil and Hindi text, the logo and
// the photos come out exactly as they look on the page. "Save as PDF" is the destination,
// and the page title becomes the file name.
function savePdf(fileName: string) {
  const previous = document.title;
  document.title = fileName;
  window.print();
  document.title = previous;
}

export function PrintButton({ autoStart = false, fileName = "Church report" }: { autoStart?: boolean; fileName?: string }) {
  useEffect(() => {
    if (!autoStart) return;
    const timer = setTimeout(() => savePdf(fileName), 700);
    return () => clearTimeout(timer);
  }, [autoStart, fileName]);

  return (
    <Button type="button" variant="outline" onClick={() => savePdf(fileName)} className="print:hidden">
      <Download className="size-4" />
      Export as PDF
    </Button>
  );
}
