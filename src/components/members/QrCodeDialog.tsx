"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode as QrCodeIcon, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function QrCodeDialog({ link, title }: { link: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    QRCode.toDataURL(link, { width: 320, margin: 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate a QR code.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, link]);

  async function handleShare() {
    try {
      await navigator.share({ title, text: `Join ${title}`, url: link });
    } catch {
      // User cancelled the share sheet, or the browser rejected it — nothing to do.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDataUrl(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <QrCodeIcon className="size-4" />
            QR code
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan to join</DialogTitle>
          <DialogDescription>
            Share this QR code so people can open the join form on their phone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !dataUrl && (
            <div className="flex size-64 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
              Generating...
            </div>
          )}
          {dataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="QR code linking to the public join form"
              width={256}
              height={256}
              className="rounded-lg"
            />
          )}
        </div>

        <DialogFooter>
          {canShare && (
            <Button type="button" variant="outline" onClick={handleShare}>
              <Share2 className="size-4" />
              Share
            </Button>
          )}
          {dataUrl && (
            <Button
              type="button"
              nativeButton={false}
              render={
                <a href={dataUrl} download="join-qr-code.png">
                  <Download className="size-4" />
                  Download
                </a>
              }
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
