"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { saveBannerItemAction, startSlideUploadAction } from "@/lib/projection/actions";
import { BANNER_ASPECT, cropRect, outputSize } from "@/lib/projection/banner-crop";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Source {
  bitmap: ImageBitmap;
  url: string;
  png: boolean;
}

// Adds a picture to the library that is shown along the bottom of the screen, like an announcement made as a picture
// (contact details, a welcome strip). The strip is the full width of the screen and 18% of its height, so the picture
// is cropped to that shape here: drag the box to choose the part, and the slider to choose how much. A PNG keeps its
// transparent background, so over video only the writing shows.
export function BannerItemForm({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; boxX: number; boxY: number } | null>(null);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rect = source ? cropRect(source.bitmap.width, source.bitmap.height, scale, pos.x, pos.y) : null;

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      if (source) URL.revokeObjectURL(source.url);
      setSource({ bitmap, url: URL.createObjectURL(file), png: file.type === "image/png" });
      // Start with the widest strip, from the middle of the picture.
      const start = cropRect(bitmap.width, bitmap.height, 1, 0, 0);
      setScale(1);
      setPos({ x: 0, y: (bitmap.height - start.h) / 2 });
      if (!title.trim()) setTitle(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120));
    } catch {
      setError("Couldn't use that picture. Choose a JPG or PNG.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function changeScale(next: number) {
    if (!source || !rect) return setScale(next);
    // Grow and shrink around the middle of the box.
    const after = cropRect(source.bitmap.width, source.bitmap.height, next, 0, 0);
    setPos({ x: rect.x + rect.w / 2 - after.w / 2, y: rect.y + rect.h / 2 - after.h / 2 });
    setScale(next);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, boxX: rect.x, boxY: rect.y };
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const width = stage.current?.clientWidth;
    if (!d || !source || !width) return;
    const ratio = source.bitmap.width / width; // picture pixels per screen pixel
    setPos({ x: d.boxX + (event.clientX - d.startX) * ratio, y: d.boxY + (event.clientY - d.startY) * ratio });
  }

  async function save() {
    if (!source || !rect) return setError("Choose the banner picture.");
    if (!title.trim()) return setError("Give the banner a title.");
    setError(null);
    try {
      setBusy("Preparing…");
      const size = outputSize(rect);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      if (!source.png) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(source.bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, source.png ? "image/png" : "image/jpeg", 0.9));
      if (!blob) throw new Error("no blob");
      if (blob.size > 3 * 1024 * 1024) return setError("That banner is too large (over 3 MB). Crop a smaller part or use a simpler picture.");
      setBusy("Uploading…");
      const start = await startSlideUploadAction(1, blob.size, source.png ? "png" : "jpg");
      if (start.error || !start.slots) return setError(start.error ?? "Couldn't start the upload.");
      const { error: uploadError } = await createBrowserClient().storage.from("projection-slides").uploadToSignedUrl(start.slots[0].path, start.slots[0].token, blob, { contentType: source.png ? "image/png" : "image/jpeg" });
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

  const imgW = source?.bitmap.width ?? 1;
  const imgH = source?.bitmap.height ?? 1;

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
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
      <Button type="button" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
        <ImagePlus className="size-4" /> {source ? "Change picture" : "Choose a picture"}
      </Button>

      {source && rect && (
        <div className="space-y-3">
          {/* The picture, with the part that will be kept lit and the rest dimmed. A checkerboard shows transparency. */}
          <div
            ref={stage}
            className="relative w-full select-none overflow-hidden rounded-md border border-border"
            style={{ background: "repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 16px 16px", aspectRatio: `${imgW} / ${imgH}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source.url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
            <div
              role="presentation"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              className="absolute cursor-move touch-none border-2 border-white"
              style={{ left: `${(rect.x / imgW) * 100}%`, top: `${(rect.y / imgH) * 100}%`, width: `${(rect.w / imgW) * 100}%`, height: `${(rect.h / imgH) * 100}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)", outline: "1px solid #0006" }}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0">How much to show</span>
            <input type="range" min={10} max={100} value={Math.round(scale * 100)} onChange={(e) => changeScale(Number(e.target.value) / 100)} className="flex-1" />
          </label>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">How it will look ({Math.round(outputSize(rect).width)} × {outputSize(rect).height})</p>
            <div className="overflow-hidden rounded border border-border bg-black" style={{ aspectRatio: String(BANNER_ASPECT) }}>
              <div
                className="h-full w-full"
                style={{
                  backgroundImage: `url("${source.url}")`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${(imgW / rect.w) * 100}% ${(imgH / rect.h) * 100}%`,
                  backgroundPosition: `${rect.w >= imgW ? 0 : (rect.x / (imgW - rect.w)) * 100}% ${rect.h >= imgH ? 0 : (rect.y / (imgH - rect.h)) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={busy !== null || !source} onClick={save}>
          Save banner
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
