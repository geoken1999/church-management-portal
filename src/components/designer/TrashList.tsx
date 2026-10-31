"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { deleteDesignForever, emptyTrash, restoreDesign } from "@/lib/designer/template-actions";
import type { DesignListItem } from "@/lib/designer/dal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DesignView } from "./DesignView";

const THUMB = 180;

type TrashItem = DesignListItem & { deleted_at: string; days_left: number };

export function TrashList({ designs, organizationId, canWrite, canDelete, days }: { designs: TrashItem[]; organizationId: string; canWrite: boolean; canDelete: boolean; days: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"all" | TrashItem | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      setConfirm(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Deleted designs stay here for {days} days, then are removed for good.</p>
        {canDelete && designs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setConfirm("all")}>
            <Trash2 className="size-4" /> Empty trash
          </Button>
        )}
      </div>
      {designs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">The trash is empty.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {designs.map((d) => {
            const left = d.days_left;
            return (
              <Card key={d.id} className="overflow-hidden">
                <div className="flex h-[210px] items-center justify-center bg-muted/50 p-2 opacity-70">
                  <div className="shadow-md">
                    <DesignView doc={d.doc} scale={Math.min(THUMB / d.width, THUMB / d.height)} />
                  </div>
                </div>
                <CardContent className="space-y-2 p-3">
                  <div>
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">Removed in {left} day{left === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex gap-1">
                    {canWrite && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => restoreDesign(d.id))}>
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(d)} aria-label="Delete forever">
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
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "all" ? "Empty the trash?" : "Delete this design forever?"}</DialogTitle>
            <DialogDescription>{confirm === "all" ? "Everything in the trash will be removed for good." : `“${confirm?.name}” will be removed for good.`} This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => (confirm === "all" ? emptyTrash(organizationId) : deleteDesignForever((confirm as { id: string }).id)))}>
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
