"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Heart } from "lucide-react";
import { createDesignFromTemplate, toggleTemplateFavorite } from "@/lib/designer/template-actions";
import type { TemplateListItem } from "@/lib/designer/templates-dal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DesignView } from "./DesignView";

const THUMB = 240;

export function TemplateCard({ template, categoryName, organizationId, canWrite, canUsePremium }: { template: TemplateListItem; categoryName: string; organizationId: string; canWrite: boolean; canUsePremium: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [favorite, setFavorite] = useState(template.favorite);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = template.is_premium && !canUsePremium;
  const scale = Math.min(THUMB / template.width, THUMB / template.height);

  function use() {
    setError(null);
    startTransition(async () => {
      const result = await createDesignFromTemplate({ organizationId, templateId: template.id });
      if (result.error) setError(result.error);
      else if (result.id) router.push(`/dashboard/studio/${result.id}`);
    });
  }

  function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    startTransition(async () => {
      const result = await toggleTemplateFavorite({ organizationId, templateId: template.id });
      if (result.error) {
        setFavorite(!next);
        setError(result.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <ErrorToast message={error} />
      <div className="relative">
        <button type="button" onClick={() => setPreviewing(true)} className="flex h-[260px] w-full items-center justify-center bg-muted/50 p-2" aria-label={`Preview ${template.title}`}>
          <div className="shadow-md">
            <DesignView doc={template.doc} scale={scale} />
          </div>
        </button>
        <button
          type="button"
          onClick={toggleFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
          className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow"
        >
          <Heart className={`size-4 ${favorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
        </button>
        {template.is_premium && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white shadow">
            <Crown className="size-3" /> Premium
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div>
          <p className="truncate text-sm font-medium" title={template.title}>{template.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {categoryName} · {template.width} × {template.height}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setPreviewing(true)}>
            Preview
          </Button>
          {canWrite && (
            <Button size="sm" onClick={use} disabled={pending || locked} title={locked ? "Premium templates need a higher plan" : undefined}>
              {locked ? "Premium" : pending ? "Opening…" : "Use template"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{template.title}</DialogTitle>
            <DialogDescription>
              {categoryName} · {template.width} × {template.height} · {template.orientation}
              {template.is_premium ? " · Premium" : " · Free"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center rounded-lg bg-muted/50 p-3">
            <div className="shadow-lg">
              <DesignView doc={template.doc} scale={Math.min(560 / template.width, 480 / template.height)} />
            </div>
          </div>
          {template.tags.length > 0 && <p className="text-xs text-muted-foreground">Tags: {template.tags.join(", ")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(false)}>
              Close
            </Button>
            {canWrite && (
              <Button onClick={use} disabled={pending || locked}>
                {locked ? "Premium template" : pending ? "Opening…" : "Customize this template"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
