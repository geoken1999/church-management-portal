"use client";

import { useEffect } from "react";
import { Download, FileText } from "lucide-react";
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

export function PrintButton({ autoStart = false, fileName = "Church report", wordHref }: { autoStart?: boolean; fileName?: string; wordHref?: string }) {
  useEffect(() => {
    if (!autoStart) return;
    const timer = setTimeout(() => savePdf(fileName), 700);
    return () => clearTimeout(timer);
  }, [autoStart, fileName]);

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {wordHref && (
        <Button type="button" variant="outline" nativeButton={false} render={<a href={wordHref} download />}>
          <FileText className="size-4" />
          Export as Word
        </Button>
      )}
      <Button type="button" variant="outline" onClick={() => savePdf(fileName)}>
        <Download className="size-4" />
        Export as PDF
      </Button>
    </div>
  );
}
