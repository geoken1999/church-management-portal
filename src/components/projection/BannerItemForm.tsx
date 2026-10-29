"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { saveBannerItemAction, startSlideUploadAction } from "@/lib/projection/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_WIDTH = 1920;

// Adds a picture to the library that is shown along the bottom of the screen, like an announcement made as a picture
// (contact details, a welcome strip). A PNG keeps its transparent background, so over video only the writing shows.
export function BannerItemForm({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [picture, setPicture] = useState<{ blob: Blob; url: string; png: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_WIDTH / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      const png = file.type === "image/png";
      if (!png) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.88));
      if (!blob) throw new Error("no blob");
      if (blob.size > 3 * 1024 * 1024) return setError("That picture is too large (over 3 MB). Use a smaller or simpler one.");
      if (picture) URL.revokeObjectURL(picture.url);
      setPicture({ blob, url: URL.createObjectURL(blob), png });
      if (!title.trim()) setTitle(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120));
    } catch {
      setError("Couldn't use that picture. Choose a JPG or PNG.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!picture) return setError("Choose the banner picture.");
    if (!title.trim()) return setError("Give the banner a title.");
    setError(null);
    try {
      setBusy("Uploading…");
      const start = await startSlideUploadAction(1, picture.blob.size, picture.png ? "png" : "jpg");
      if (start.error || !start.slots) return setError(start.error ?? "Couldn't start the upload.");
      const { error: uploadError } = await createBrowserClient().storage.from("projection-slides").uploadToSignedUrl(start.slots[0].path, start.slots[0].token, picture.blob, { contentType: picture.png ? "image/png" : "image/jpeg" });
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
          A wide picture shown along the bottom of the screen at full width, such as your contact details or a welcome message. Use a PNG with a transparent background to let the video show through.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pj-banner-title">Title</Label>
        <Input id="pj-banner-title" value={title} maxLength={120} placeholder="e.g. Contact us" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
          <ImagePlus className="size-4" /> {picture ? "Change picture" : "Choose a picture"}
        </Button>
      </div>
      {picture && (
        // A checkerboard shows which parts are transparent.
        <div className="overflow-hidden rounded-md border border-border" style={{ background: "repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 16px 16px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={picture.url} alt="Banner preview" className="block h-auto w-full" />
        </div>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={busy !== null || !picture} onClick={save}>
          Save banner
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
