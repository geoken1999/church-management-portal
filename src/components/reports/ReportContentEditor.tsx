"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Trash2, Type } from "lucide-react";
import { addReportBlockImageAction, saveReportContentAction } from "@/lib/reports/monthly-actions";
import { MAX_BLOCK_TEXT, MAX_REPORT_BLOCKS, type ReportBlock } from "@/lib/reports/monthly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

// Edit a finished report's words and add to it: change the summary and the note, and add headings with text or
// pictures, in any order. Shown to people who can edit reports, and not when the report is printed.
export function ReportContentEditor({
  reportId,
  narrative,
  note,
  blocks: initialBlocks,
  photoBase,
}: {
  reportId: string;
  narrative: { text: string; highlights: string[] } | null;
  note: string | null;
  blocks: ReportBlock[];
  photoBase: string;
}) {
  const [summary, setSummary] = useState(narrative?.text ?? "");
  const [highlights, setHighlights] = useState((narrative?.highlights ?? []).join("\n"));
  const [noteText, setNoteText] = useState(note ?? "");
  const [blocks, setBlocks] = useState<ReportBlock[]>(initialBlocks);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const imageForm = useRef<HTMLFormElement>(null);

  const change = (next: ReportBlock[]) => {
    setBlocks(next);
    setSaved(false);
  };
  const update = (id: string, patch: Partial<ReportBlock>) => change(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as ReportBlock) : b)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...blocks];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  };

  function addImage(formData: FormData) {
    setError(null);
    formData.set("reportId", reportId);
    startTransition(async () => {
      const result = await addReportBlockImageAction(formData);
      if (result.error) setError(result.error);
      else if (result.block) {
        change([...blocks, result.block]);
        imageForm.current?.reset();
      }
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveReportContentAction(reportId, {
        summary,
        highlights: highlights.split("\n"),
        note: noteText,
        blocks,
      });
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pencil className="size-4 text-primary" />
          Edit this report
        </CardTitle>
        <CardDescription>Change the summary and note, and add your own headings, text and pictures after the figures. Press Save changes to keep your edits. The figures themselves come from your records and can&apos;t be edited here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ErrorToast message={error} />

        {narrative && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-summary" className="text-xs font-medium">
                Summary
              </label>
              <textarea id="edit-summary" value={summary} onChange={(e) => { setSummary(e.target.value); setSaved(false); }} rows={6} maxLength={6000} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <p className="text-xs text-muted-foreground">Leave a blank line between paragraphs.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-highlights" className="text-xs font-medium">
                Highlights (one per line)
              </label>
              <textarea id="edit-highlights" value={highlights} onChange={(e) => { setHighlights(e.target.value); setSaved(false); }} rows={4} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="edit-note" className="text-xs font-medium">
            Note from the team
          </label>
          <textarea id="edit-note" value={noteText} onChange={(e) => { setNoteText(e.target.value); setSaved(false); }} rows={3} maxLength={1500} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">
            Added content <span className="font-normal text-muted-foreground">({blocks.length} of {MAX_REPORT_BLOCKS})</span>
          </p>
          {blocks.length === 0 && <p className="text-sm text-muted-foreground">Nothing added yet. Add a heading with text, or a picture.</p>}
          {blocks.map((block, index) => (
            <div key={block.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">{block.type === "text" ? "Text" : "Picture"}</span>
                <div className="flex gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => change(blocks.filter((b) => b.id !== block.id))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {block.type === "text" ? (
                <>
                  <Input value={block.heading} maxLength={120} placeholder="Heading (optional)" aria-label="Heading" onChange={(e) => update(block.id, { heading: e.target.value })} />
                  <textarea value={block.text} maxLength={MAX_BLOCK_TEXT} rows={5} placeholder="Write here. Leave a blank line between paragraphs." aria-label="Text" onChange={(e) => update(block.id, { text: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${photoBase}${block.path}`} alt={block.caption} className="h-24 w-32 rounded-lg object-cover" />
                  <Input value={block.caption} maxLength={140} placeholder="Caption (optional)" aria-label="Caption" className="min-w-48 flex-1" onChange={(e) => update(block.id, { caption: e.target.value })} />
                </div>
              )}
            </div>
          ))}

          {blocks.length < MAX_REPORT_BLOCKS && (
            <div className="flex flex-wrap items-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => change([...blocks, { id: crypto.randomUUID(), type: "text", heading: "", text: "" }])}>
                <Type className="size-4" /> Add text
              </Button>
              <form ref={imageForm} action={addImage} className="flex flex-wrap items-end gap-2">
                <Input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Picture" className="w-56" />
                <Input name="caption" maxLength={140} placeholder="Caption (optional)" aria-label="Caption for the new picture" className="w-48" />
                <Button type="submit" variant="outline" size="sm" disabled={pending}>
                  <ImagePlus className="size-4" /> {pending ? "Adding..." : "Add picture"}
                </Button>
              </form>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Pictures: JPEG, PNG or WebP, up to 3 MB each. They count towards your storage.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
          {saved && <span className="text-sm text-primary">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
