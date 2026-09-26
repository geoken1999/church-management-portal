"use client";

import { useState } from "react";
import { Eye, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SAMPLE_NAME = "Jane Doe";
const SAMPLE_CODE = "ABC12345";

// A live, on-page mockup of the pass a registrant will actually be
// emailed (registration-pass.ts builds the real one) — not a re-render of
// that exact inline-styled HTML, since that markup is written for email
// client compatibility (tables, inline styles) rather than for a live
// preview, and duplicating it byte-for-byte here would mean keeping two
// templates in sync for a feature that's just meant to give an organizer a
// rough sense of what they're sending.
export function EventPassPreview({
  eventTitle,
  startAt,
  locationLabel,
  passColor,
  passMessage,
  backgroundUrl,
}: {
  eventTitle: string;
  startAt: string;
  locationLabel: string;
  passColor: string;
  passMessage: string;
  backgroundUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const startLabel = new Date(startAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Eye className="size-3.5" />
            Preview pass
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registration pass preview</DialogTitle>
          <DialogDescription>A rough preview using a sample registrant — the real email also attaches a QR code and calendar invite.</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-2xl border border-border">
          {backgroundUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- previewing an arbitrary uploaded/remote image, not a static app asset
            <img src={backgroundUrl} alt="" className="h-28 w-full object-cover" />
          ) : (
            <div className="h-24" style={{ background: `linear-gradient(135deg, ${passColor}, transparent)` }} />
          )}

          <div className="space-y-1 bg-background px-5 pt-4 pb-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Your church</p>
            <h3 className="text-lg font-semibold">{eventTitle || "Event title"}</h3>
            <p className="text-sm text-muted-foreground">{startLabel}</p>
            <p className="text-sm text-muted-foreground">{locationLabel}</p>
          </div>

          <div className="relative mx-5 border-t-2 border-dashed border-border">
            <span className="absolute -left-[34px] -top-[11px] size-5 rounded-full bg-muted" />
            <span className="absolute -right-[34px] -top-[11px] size-5 rounded-full bg-muted" />
          </div>

          <div className="space-y-3 bg-background px-5 pt-4 pb-4">
            <div>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Registered to</p>
              <p className="text-sm font-semibold">{SAMPLE_NAME}</p>
            </div>
            {passMessage && <p className="text-sm text-muted-foreground">{passMessage}</p>}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Confirmation code</p>
                <p className="text-xl font-bold tracking-widest" style={{ color: passColor }}>
                  {SAMPLE_CODE}
                </p>
              </div>
              <div className="flex size-[72px] shrink-0 items-center justify-center rounded-md border border-border bg-muted/40" aria-hidden>
                <QrCode className="size-8 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-muted/40 px-5 py-2.5">
            <p className="text-xs text-muted-foreground">Show this pass at check-in — your QR code and a calendar invite are attached.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
