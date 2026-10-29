"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { BANNER_ASPECT, cropRect, outputSize, type CropRect } from "@/lib/projection/banner-crop";
import { Button } from "@/components/ui/button";

export interface BannerCrop {
  bitmap: ImageBitmap;
  png: boolean;
  rect: CropRect;
}

/** Draws the chosen part of the picture at the banner's size. A PNG keeps its transparent background. */
export async function cropToBlob(crop: BannerCrop): Promise<Blob> {
  const size = outputSize(crop.rect);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare pictures.");
  if (!crop.png) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(crop.bitmap, crop.rect.x, crop.rect.y, crop.rect.w, crop.rect.h, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, crop.png ? "image/png" : "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't prepare that picture.");
  return blob;
}

interface Source {
  bitmap: ImageBitmap;
  url: string;
  png: boolean;
}

// Choose a picture and cut a banner out of it. The banner strip is the full width of the screen and 18% of its height,
// so the picture is cropped to that shape: drag the box to choose the part, and the slider to choose how much.
export function BannerCropper({ disabled, onChange, onFileName }: { disabled?: boolean; onChange: (crop: BannerCrop | null) => void; onFileName?: (name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; boxX: number; boxY: number } | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const rect = source ? cropRect(source.bitmap.width, source.bitmap.height, scale, pos.x, pos.y) : null;

  function report(next: Source | null, nextScale: number, nextPos: { x: number; y: number }) {
    onChange(next ? { bitmap: next.bitmap, png: next.png, rect: cropRect(next.bitmap.width, next.bitmap.height, nextScale, nextPos.x, nextPos.y) } : null);
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      if (source) URL.revokeObjectURL(source.url);
      const next = { bitmap, url: URL.createObjectURL(file), png: file.type === "image/png" };
      // Start with the widest strip, from the middle of the picture.
      const start = cropRect(bitmap.width, bitmap.height, 1, 0, 0);
      const startPos = { x: 0, y: (bitmap.height - start.h) / 2 };
      setSource(next);
      setScale(1);
      setPos(startPos);
      report(next, 1, startPos);
      onFileName?.(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120));
    } catch {
      setError("Couldn't use that picture. Choose a JPG or PNG.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function changeScale(next: number) {
    if (!source || !rect) return;
    // Grow and shrink around the middle of the box.
    const after = cropRect(source.bitmap.width, source.bitmap.height, next, 0, 0);
    const nextPos = { x: rect.x + rect.w / 2 - after.w / 2, y: rect.y + rect.h / 2 - after.h / 2 };
    setScale(next);
    setPos(nextPos);
    report(source, next, nextPos);
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
    const nextPos = { x: d.boxX + (event.clientX - d.startX) * ratio, y: d.boxY + (event.clientY - d.startY) * ratio };
    setPos(nextPos);
    report(source, scale, nextPos);
  }

  const imgW = source?.bitmap.width ?? 1;
  const imgH = source?.bitmap.height ?? 1;

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
        <ImagePlus className="size-4" /> {source ? "Change picture" : "Choose a picture"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}

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
            <p className="mb-1 text-xs text-muted-foreground">
              How it will look ({outputSize(rect).width} × {outputSize(rect).height})
            </p>
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
    </div>
  );
}
