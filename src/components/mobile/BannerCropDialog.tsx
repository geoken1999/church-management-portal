"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BANNER_HEIGHT, BANNER_WIDTH, MAX_BANNER_BYTES } from "@/lib/member-home/schema";

function clamp(value: { x: number; y: number }, w: number, h: number) {
  return {
    x: Math.min(0, Math.max(w <= BANNER_WIDTH ? 0 : BANNER_WIDTH - w, value.x)),
    y: Math.min(0, Math.max(h <= BANNER_HEIGHT ? 0 : BANNER_HEIGHT - h, value.y)),
  };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// Crops any picture to the banner's fixed size, the way LogoCropDialog does
// for logos: the canvas is BANNER_WIDTH x BANNER_HEIGHT 1:1, so what's shown
// is exactly what's uploaded. The image always covers the frame (no empty
// edges). Output is re-encoded as JPEG, stepping quality down if needed to
// stay under the upload limit, which also keeps it small against the
// church's storage package.
export function BannerCropDialog({ bitmap, onCancel, onConfirm }: { bitmap: ImageBitmap | null; onCancel: () => void; onConfirm: (file: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rawOffset, setRawOffset] = useState({ x: 0, y: 0 });
  const [encoding, setEncoding] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const baseScale = bitmap ? Math.max(BANNER_WIDTH / bitmap.width, BANNER_HEIGHT / bitmap.height) : 1;
  const scale = baseScale * zoom;
  const dispW = bitmap ? bitmap.width * scale : 0;
  const dispH = bitmap ? bitmap.height * scale : 0;
  const offset = clamp(rawOffset, dispW, dispH);

  const [prevBitmap, setPrevBitmap] = useState(bitmap);
  if (bitmap !== prevBitmap) {
    setPrevBitmap(bitmap);
    setZoom(1);
    if (bitmap) {
      const fit = Math.max(BANNER_WIDTH / bitmap.width, BANNER_HEIGHT / bitmap.height);
      setRawOffset({ x: (BANNER_WIDTH - bitmap.width * fit) / 2, y: (BANNER_HEIGHT - bitmap.height * fit) / 2 });
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !bitmap) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    ctx.drawImage(bitmap, offset.x, offset.y, dispW, dispH);
  }, [bitmap, offset.x, offset.y, dispW, dispH]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    // Pointer deltas are CSS pixels; the canvas is drawn at full banner size.
    const displayScale = BANNER_WIDTH / e.currentTarget.getBoundingClientRect().width;
    setRawOffset({ x: drag.offsetX + (e.clientX - drag.startX) * displayScale, y: drag.offsetY + (e.clientY - drag.startY) * displayScale });
  }

  async function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setEncoding(true);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.size <= MAX_BANNER_BYTES) {
        setEncoding(false);
        onConfirm(new File([blob], "banner.jpg", { type: "image/jpeg" }));
        return;
      }
    }
    setEncoding(false);
    onCancel();
  }

  return (
    <Dialog open={bitmap !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crop your banner</DialogTitle>
          <DialogDescription>
            Banners are {BANNER_WIDTH}×{BANNER_HEIGHT} (2:1). Drag to reposition and use the slider to zoom.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            width={BANNER_WIDTH}
            height={BANNER_HEIGHT}
            className="aspect-[2/1] w-full max-w-md cursor-move touch-none rounded-lg border border-border"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => (dragRef.current = null)}
            onPointerLeave={() => (dragRef.current = null)}
          />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-64" aria-label="Zoom" />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={encoding}>
            {encoding ? "Preparing..." : "Use this banner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
