"use client";

import { useState } from "react";
import { MAX_CANVAS_SIDE, SIZE_PRESETS } from "@/lib/designer/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ResizeDialog({
  open,
  onOpenChange,
  width,
  height,
  busy,
  onResize,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  height: number;
  busy: boolean;
  onResize: (width: number, height: number) => void;
  onCopy: (width: number, height: number) => void;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const nw = Math.round(Number(w));
  const nh = Math.round(Number(h));
  const valid = nw >= 100 && nh >= 100 && nw <= MAX_CANVAS_SIDE && nh <= MAX_CANVAS_SIDE && (nw !== width || nh !== height);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resize</DialogTitle>
          <DialogDescription>Elements move and scale with the page. Text, pictures and symbols keep their proportions.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setW(String(p.width));
                setH(String(p.height));
              }}
              className={`rounded-lg border p-2 text-left text-sm transition ${nw === p.width && nh === p.height ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted"}`}
            >
              <span className="block font-medium">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.width} × {p.height}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" min={100} max={MAX_CANVAS_SIDE} value={w} onChange={(e) => setW(e.target.value)} className="w-28" aria-label="Width in pixels" />
          <span className="text-muted-foreground">×</span>
          <Input type="number" min={100} max={MAX_CANVAS_SIDE} value={h} onChange={(e) => setH(e.target.value)} className="w-28" aria-label="Height in pixels" />
          <span className="text-xs text-muted-foreground">pixels (up to {MAX_CANVAS_SIDE})</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" disabled={!valid || busy} onClick={() => onCopy(nw, nh)}>
            Create a resized copy
          </Button>
          <Button disabled={!valid || busy} onClick={() => onResize(nw, nh)}>
            Resize this design
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
