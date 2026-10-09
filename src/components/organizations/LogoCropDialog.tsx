"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// The fixed output size — matches LOGO_TARGET_PX in ChurchLogoUpload. The
// canvas is rendered at this size 1:1 (no separate "preview" vs "export"
// resolution), so what's shown here is exactly what gets uploaded.
const OUTPUT_PX = 512;

function clamp(value: { x: number; y: number }, w: number, h: number) {
  return {
    x: Math.min(0, Math.max(w <= OUTPUT_PX ? 0 : OUTPUT_PX - w, value.x)),
    y: Math.min(0, Math.max(h <= OUTPUT_PX ? 0 : OUTPUT_PX - h, value.y)),
  };
}

interface LogoCropDialogProps {
  bitmap: ImageBitmap | null;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

// Shown whenever a selected logo is bigger than ChurchLogoUpload's 512x512
// target, instead of silently auto-resizing it — the admin drags to pan
// and uses the slider to zoom, then confirms exactly what the logo will
// look like before it's uploaded. The image always fully covers the
// square (no letterboxing), the same way the final avatar is displayed.
export function LogoCropDialog({ bitmap, onCancel, onConfirm }: LogoCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  // The raw drag position — clamped against the CURRENT zoom's pan range
  // on every render below (rawOffset itself is never force-corrected by an
  // effect; see prevBitmap handling for why).
  const [rawOffset, setRawOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  // "Cover" scale — the smaller side exactly fills OUTPUT_PX at zoom 1, so
  // there's never empty space at the edges of the crop.
  const baseScale = bitmap ? OUTPUT_PX / Math.min(bitmap.width, bitmap.height) : 1;
  const scale = baseScale * zoom;
  const dispW = bitmap ? bitmap.width * scale : 0;
  const dispH = bitmap ? bitmap.height * scale : 0;
  const offset = clamp(rawOffset, dispW, dispH);

  // A new image: reset to zoom 1, centered — adjusting state during
  // render (React's documented pattern for "reset state when a prop
  // changes") rather than in an effect, so it takes effect in the same
  // render pass instead of an extra commit.
  const [prevBitmap, setPrevBitmap] = useState(bitmap);
  if (bitmap !== prevBitmap) {
    setPrevBitmap(bitmap);
    setZoom(1);
    if (bitmap) {
      const fitScale = OUTPUT_PX / Math.min(bitmap.width, bitmap.height);
      setRawOffset({ x: (OUTPUT_PX - bitmap.width * fitScale) / 2, y: (OUTPUT_PX - bitmap.height * fitScale) / 2 });
    }
  }

  // Syncing committed React state to the canvas (an external, imperative
  // API) is exactly what an effect is for — unlike the clamping above,
  // which is a pure derivation and needed no effect at all.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !bitmap) return;
    ctx.clearRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    ctx.drawImage(bitmap, offset.x, offset.y, dispW, dispH);
  }, [bitmap, offset.x, offset.y, dispW, dispH]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    // The canvas draws at OUTPUT_PX (512) but is displayed smaller (see
    // the size-64 className below) — pointer deltas arrive in CSS pixels,
    // so they need scaling up to canvas-pixel units or panning would feel
    // sluggish relative to the drag distance on screen.
    const displayScale = OUTPUT_PX / e.currentTarget.getBoundingClientRect().width;
    setRawOffset({
      x: drag.offsetX + (e.clientX - drag.startX) * displayScale,
      y: drag.offsetY + (e.clientY - drag.startY) * displayScale,
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], "logo.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <Dialog open={bitmap !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resize your logo</DialogTitle>
          <DialogDescription>Drag to reposition, and use the slider to zoom. Logos are uploaded at {OUTPUT_PX}×{OUTPUT_PX}.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            width={OUTPUT_PX}
            height={OUTPUT_PX}
            className="size-64 cursor-move touch-none rounded-lg border border-border"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-64"
            aria-label="Zoom"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Use this logo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
