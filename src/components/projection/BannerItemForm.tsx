"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveBannerItemAction, startSlideUploadAction } from "@/lib/projection/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { BannerCropper, cropToBlob, type BannerCrop } from "@/components/projection/BannerCropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Adds a picture to the library that is shown along the bottom of the screen, like an announcement made as a picture
// (contact details, a welcome strip). The strip is the full width of the screen and 18% of its height, so the picture
// is cropped to that shape here.
export function BannerItemForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [crop, setCrop] = useState<BannerCrop | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!crop) return setError("Choose the banner picture.");
    if (!title.trim()) return setError("Give the banner a title.");
    setError(null);
    try {
      setBusy("Preparing…");
      const blob = await cropToBlob(crop);
      if (blob.size > 3 * 1024 * 1024) return setError("That banner is too large (over 3 MB). Crop a smaller part or use a simpler picture.");
      setBusy("Uploading…");
      const start = await startSlideUploadAction(1, blob.size, crop.png ? "png" : "jpg");
      if (start.error || !start.slots) return setError(start.error ?? "Couldn't start the upload.");
      const { error: uploadError } = await createBrowserClient().storage.from("projection-slides").uploadToSignedUrl(start.slots[0].path, start.slots[0].token, blob, { contentType: crop.png ? "image/png" : "image/jpeg" });
      if (uploadError) return setError(`The upload failed (${uploadError.message}). Check your connection and try again.`);
      setBusy("Saving…");
      const saved = await saveBannerItemAction(title, start.slots[0].path);
      if (saved.error) return setError(saved.error);
      onDone();
    } catch {
      setError("Something went wrong while uploading. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="font-medium">Add a banner picture</p>
        <p className="text-sm text-muted-foreground">
          Shown along the bottom of the screen at full width and 18% of its height (a wide strip, about 1920 × 194 pixels on a full-HD screen). Choose a picture, then drag the box to pick the part to show. Use a PNG with a transparent background to let the video show through.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pj-banner-title">Title</Label>
        <Input id="pj-banner-title" value={title} maxLength={120} placeholder="e.g. Contact us" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <BannerCropper disabled={busy !== null} onChange={setCrop} onFileName={(name) => setTitle((current) => current.trim() || name)} />
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={busy !== null || !crop} onClick={save}>
          Save banner
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
