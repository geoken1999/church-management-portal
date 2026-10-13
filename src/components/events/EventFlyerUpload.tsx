"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { removeEventFlyerAction, uploadEventFlyerAction } from "@/lib/events/flyer-actions";
import { flyerProblem, flyerUrl, MAX_FLYER_BYTES } from "@/lib/events/flyer";
import { Button } from "@/components/ui/button";

// An event's flyer: shown on the event, and used in the church report.
export function EventFlyerUpload({ eventId, flyerPath }: { eventId: string; flyerPath: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(flyerPath);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = flyerProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("flyer", file);
    startTransition(async () => {
      const result = await uploadEventFlyerAction(form);
      if (result.error) setError(result.error);
      else {
        setPath(result.path ?? null);
        router.refresh();
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeEventFlyerAction(eventId);
      if (result.error) setError(result.error);
      else {
        setPath(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Flyer (optional)</p>
      <p className="text-xs text-muted-foreground">An image of the event, JPEG, PNG or WebP up to {Math.round(MAX_FLYER_BYTES / (1024 * 1024))} MB. It is used in your church reports.</p>
      {path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={flyerUrl(path)} alt="Event flyer" className="max-h-48 rounded-md border border-border object-contain" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <ImagePlus className="size-3.5" />
          {pending ? "Saving…" : path ? "Replace flyer" : "Upload flyer"}
        </Button>
        {path && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remove}>
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
