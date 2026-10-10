"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { removeOrganizationQrLogo, updateOrganizationQrLogo, updateOrganizationQrLogoSize } from "@/lib/organizations/actions";
import { QR_LOGO_SIZE_MAX, QR_LOGO_SIZE_MIN } from "@/lib/qr/logo-size";
import { renderQrDataUrl } from "@/lib/qr/render-with-logo";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Square, small: it is drawn at about a fifth of the QR's width.
const OUTPUT_PX = 256;
const MIN_PX = 64;

// Center-crops to a square and scales to OUTPUT_PX, as a PNG (keeps any
// transparency; the QR draws a white backing behind it anyway).
async function toSquarePng(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < MIN_PX || bitmap.height < MIN_PX) throw new Error(`Use an image at least ${MIN_PX}×${MIN_PX} pixels.`);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Couldn't process that image.");
    return new File([blob], "qr-logo.png", { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

export function QrLogoUpload({ organizationId, qrLogoUrl, qrLogoSize, sampleLink }: { organizationId: string; qrLogoUrl: string | null; qrLogoSize: number; sampleLink: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // What the slider shows; the saved value only changes on Save.
  const [size, setSize] = useState(qrLogoSize);

  // A live sample, so the church sees exactly how their codes will look.
  useEffect(() => {
    let cancelled = false;
    renderQrDataUrl(sampleLink, { width: 320, logoUrl: qrLogoUrl, logoSizePercent: size }).then((url) => {
      if (!cancelled) setPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [sampleLink, qrLogoUrl, size]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    let png: File;
    try {
      png = await toSquarePng(file);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That image couldn't be processed." });
      return;
    }
    const data = new FormData();
    data.append("organizationId", organizationId);
    data.append("logo", png);
    startTransition(async () => {
      const result = await updateOrganizationQrLogo({}, data);
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: "QR logo saved." });
    });
  }

  function handleSaveSize() {
    startTransition(async () => {
      const result = await updateOrganizationQrLogoSize(organizationId, size);
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: "Logo size saved." });
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeOrganizationQrLogo(organizationId);
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: "QR logo removed." });
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview ? <img src={preview} alt="Sample QR code" className="size-32 rounded-lg border border-border" /> : <div className="size-32 rounded-lg bg-muted" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-muted-foreground">
          Shown in the centre of your QR codes: the join link, event registration links, forms, event passes and your members&apos; check-in code. Pick a simple, square mark;
          it is cropped to a square.
        </p>
        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {qrLogoUrl && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="qr-logo-size" className="font-medium">
                Logo size
              </label>
              <span className="text-muted-foreground">{size}% of the code</span>
            </div>
            <input
              id="qr-logo-size"
              type="range"
              min={QR_LOGO_SIZE_MIN}
              max={QR_LOGO_SIZE_MAX}
              step={1}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full max-w-xs"
            />
            {size > 25 && <p className="text-xs text-muted-foreground">A larger logo can make the code harder to scan. Test it with a phone before sharing it.</p>}
            {size !== qrLogoSize && (
              <Button type="button" size="sm" onClick={handleSaveSize} disabled={pending}>
                Save size
              </Button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
            {pending ? "Saving..." : qrLogoUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {qrLogoUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={pending}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
