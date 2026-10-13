"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { addReportPhotoAction, removeReportPhotoAction } from "@/lib/reports/monthly-actions";
import { MAX_REPORT_PHOTOS, type ReportPhoto } from "@/lib/reports/monthly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Add photos to a report (for example from an event), or take them off again. Shown to
// people who can edit reports, and not when the report is printed.
export function ReportPhotosEditor({ reportId, photos, photoUrl, eventTitles }: { reportId: string; photos: ReportPhoto[]; photoUrl: (path: string) => string; eventTitles: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function add(formData: FormData) {
    setError(null);
    formData.set("reportId", reportId);
    startTransition(async () => {
      const result = await addReportPhotoAction(formData);
      if (result.error) setError(result.error);
      else formRef.current?.reset();
    });
  }

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImagePlus className="size-4 text-primary" />
          Photos
        </CardTitle>
        <CardDescription>
          Add pictures from your events or services to the report. JPEG, PNG or WebP, up to 3 MB each, at most {MAX_REPORT_PHOTOS}. They show in the report on the web and in the app, and count towards your storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {photos.length < MAX_REPORT_PHOTOS && (
          <form ref={formRef} action={add} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="photo" className="text-xs font-medium">
                Photo
              </label>
              <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="w-64" />
            </div>
            <div className="min-w-48 flex-1 space-y-1.5">
              <label htmlFor="caption" className="text-xs font-medium">
                Caption (an event name works well)
              </label>
              <Input id="caption" name="caption" list="report-event-titles" maxLength={140} placeholder="Youth camp, Sunday 14 Sept" />
              <datalist id="report-event-titles">
                {eventTitles.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add photo"}
            </Button>
          </form>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.path} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(photo.path)} alt={photo.caption} className="aspect-[4/3] w-full rounded-lg object-cover" />
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs text-muted-foreground">{photo.caption}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove photo"
                    disabled={pending}
                    onClick={() => startTransition(async () => void (await removeReportPhotoAction(reportId, photo.path)))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
