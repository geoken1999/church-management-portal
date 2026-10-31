"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2, Pencil, Sparkles, PlaySquare } from "lucide-react";
import { createDesign, duplicateDesign, deleteDesign } from "@/lib/designer/actions";
import { SIZE_PRESETS } from "@/lib/designer/model";
import { TEMPLATES } from "@/lib/designer/templates";
import type { DesignListItem } from "@/lib/designer/dal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DesignView } from "./DesignView";
import { AiDesignDialog } from "./AiDesignDialog";

const THUMB = 220;

export function DesignerGallery({
  organizationId,
  churchName,
  logoUrl,
  designs,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  churchName: string;
  logoUrl: string | null;
  designs: DesignListItem[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("sunday");
  const [size, setSize] = useState("a4");
  const [customWidth, setCustomWidth] = useState("1000");
  const [customHeight, setCustomHeight] = useState("1000");
  const [toDelete, setToDelete] = useState<DesignListItem | null>(null);

  function startThumbnail() {
    setTemplate("thumb-sermon");
    setSize("thumbnail");
    setName("");
    setCreating(true);
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createDesign({
        organizationId,
        name,
        template,
        size,
        customWidth: Number(customWidth),
        customHeight: Number(customHeight),
        churchName,
      });
      if (result.error) setError(result.error);
      else if (result.id) router.push(`/dashboard/studio/${result.id}`);
    });
  }

  function copy(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await duplicateDesign(id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!toDelete) return;
    const id = toDelete.id;
    setError(null);
    startTransition(async () => {
      const result = await deleteDesign(id);
      if (result.error) setError(result.error);
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAiOpen(true)}>
            <Sparkles className="size-4" /> Design with AI
          </Button>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New design
          </Button>
          <Button variant="outline" onClick={startThumbnail}>
            <PlaySquare className="size-4" /> YouTube thumbnail
          </Button>
        </div>
      )}
      <AiDesignDialog open={aiOpen} onOpenChange={setAiOpen} organizationId={organizationId} churchName={churchName} logoUrl={logoUrl} onError={setError} />

      {designs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No designs yet. Start from a template for a Sunday flyer, an event poster, a Bible verse, a social post or a YouTube thumbnail.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {designs.map((design) => {
            const scale = Math.min(THUMB / design.width, THUMB / design.height);
            return (
              <Card key={design.id} className="overflow-hidden">
                <Link href={`/dashboard/studio/${design.id}`} className="flex h-[240px] items-center justify-center bg-muted/50 p-2">
                  <div className="shadow-md">
                    <DesignView doc={design.doc} scale={scale} />
                  </div>
                </Link>
                <CardContent className="space-y-2 p-3">
                  <div>
                    <p className="truncate text-sm font-medium">{design.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {design.width} × {design.height} · {new Date(design.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/dashboard/studio/${design.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <Pencil className="size-3.5" /> {canWrite ? "Edit" : "Open"}
                    </Link>
                    {canWrite && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => copy(design.id)} aria-label="Duplicate design">
                        <Copy className="size-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setToDelete(design)} aria-label="Delete design">
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New design</DialogTitle>
            <DialogDescription>Pick a starting point and a size. You can change everything in the editor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="design-name">Name</Label>
              <Input id="design-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Christmas carol flyer" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTemplate(t.key)}
                    className={`rounded-lg border p-2 text-left transition ${template === t.key ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted"}`}
                  >
                    <span className="mb-2 block h-14 rounded-md border" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Size</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[...SIZE_PRESETS, { key: "custom", label: "Custom size", note: "Your own width and height" }].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSize(s.key)}
                    className={`rounded-lg border p-2 text-left text-sm transition ${size === s.key ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted"}`}
                  >
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.note}</span>
                  </button>
                ))}
              </div>
              {size === "custom" && (
                <div className="flex items-center gap-2 pt-1">
                  <Input type="number" min={100} max={4000} value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className="w-28" aria-label="Width in pixels" />
                  <span className="text-muted-foreground">×</span>
                  <Input type="number" min={100} max={4000} value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className="w-28" aria-label="Height in pixels" />
                  <span className="text-xs text-muted-foreground">pixels</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create design"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this design?</DialogTitle>
            <DialogDescription>“{toDelete?.name}” will be removed for everyone. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
