"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { createDesign, generateAiDesign } from "@/lib/designer/actions";
import { readImage, type ReadImage } from "@/lib/designer/image-utils";
import { SIZE_PRESETS } from "@/lib/designer/model";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX_PICTURES = 3;
const EXAMPLES = [
  "A bright Sunday service invitation, 9:30 AM, with a welcoming feel",
  "Christmas carol night on 24 December at 6:30 PM, elegant green and gold",
  "Youth camp poster, energetic and colourful, with our group photo",
];

interface Attached extends ReadImage {
  key: string;
  name: string;
}

export function AiDesignDialog({
  open,
  onOpenChange,
  organizationId,
  churchName,
  logoUrl,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  churchName: string;
  logoUrl: string | null;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("a4");
  const [pictures, setPictures] = useState<Attached[]>([]);
  const [useLogo, setUseLogo] = useState(false);
  const [working, setWorking] = useState<"idle" | "designing" | "saving">("idle");

  async function addPictures(files: FileList | null) {
    if (!files) return;
    const room = MAX_PICTURES - pictures.length;
    const next: Attached[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
        onError("Use a PNG, JPG, WebP or GIF picture.");
        continue;
      }
      try {
        next.push({ ...(await readImage(file)), key: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, "") });
      } catch (e) {
        onError(e instanceof Error ? e.message : "That picture couldn't be added.");
      }
    }
    if (next.length) setPictures((p) => [...p, ...next]);
  }

  async function generate() {
    setWorking("designing");
    try {
      // The AI sees small previews; the full pictures stay here and are put in afterwards.
      const refs = pictures.map((p, i) => ({ ...p, ref: `image${i + 1}` }));
      const result = await generateAiDesign({
        organizationId,
        prompt,
        size,
        churchName,
        images: [
          ...refs.map((p) => ({ ref: p.ref, label: p.name, width: p.w, height: p.h, preview: p.preview })),
          ...(useLogo && logoUrl ? [{ ref: "logo", label: "logo", width: 400, height: 400, preview: logoUrl }] : []),
        ],
      });
      if (result.error || !result.doc || !result.slots) {
        onError(result.error ?? "The AI designer couldn't make that. Please try again.");
        setWorking("idle");
        return;
      }
      const sources = new Map<string, string>(refs.map((p) => [p.ref, p.src]));
      if (useLogo && logoUrl) sources.set("logo", logoUrl);
      const slotSrc = new Map(result.slots.map((s) => [s.elementId, sources.get(s.ref)]));
      const doc = {
        ...result.doc,
        elements: result.doc.elements
          .map((el) => (slotSrc.has(el.id) ? { ...el, src: slotSrc.get(el.id) } : el))
          .filter((el) => el.type !== "image" || (el.src && !el.src.startsWith("data:image/png;base64,iVBORw0KGgo"))),
      };
      setWorking("saving");
      const created = await createDesign({ organizationId, name: result.name ?? "AI design", template: "blank", size: result.size ?? size, churchName, doc });
      if (created.error || !created.id) {
        onError(created.error ?? "Couldn't save the design. Please try again.");
        setWorking("idle");
        return;
      }
      router.push(`/dashboard/studio/${created.id}`);
    } catch {
      onError("Something went wrong while designing. Please try again.");
      setWorking("idle");
    }
  }

  const busy = working !== "idle";
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> Design with AI
          </DialogTitle>
          <DialogDescription>Describe your flyer or poster and add pictures if you like. The AI lays it out, then you can change anything in the editor. Uses 1 AI credit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt">What is it for?</Label>
            <Textarea id="ai-prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1500} disabled={busy} placeholder="Sunday service at 9:30 AM, a friendly invitation for new families, blue and white" />
            <div className="flex flex-wrap gap-1">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" disabled={busy} onClick={() => setPrompt(example)} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                  {example.length > 38 ? `${example.slice(0, 38)}…` : example}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Include the date, time and place you want shown. The AI won&apos;t make them up.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Pictures (optional, up to {MAX_PICTURES})</Label>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(e) => { void addPictures(e.target.files); e.target.value = ""; }} />
            <div className="flex flex-wrap items-center gap-2">
              {pictures.map((p) => (
                <div key={p.key} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={p.name} className="size-16 rounded-md border object-cover" />
                  <button type="button" disabled={busy} onClick={() => setPictures((list) => list.filter((x) => x.key !== p.key))} className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5" aria-label={`Remove ${p.name}`}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {pictures.length < MAX_PICTURES && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="size-4" /> Add picture
                </Button>
              )}
            </div>
            {logoUrl && (
              <label className="flex items-center gap-2 pt-1 text-sm">
                <input type="checkbox" checked={useLogo} disabled={busy} onChange={(e) => setUseLogo(e.target.checked)} />
                Include our church logo
              </label>
            )}
            <p className="text-xs text-muted-foreground">The AI is shown small previews so it can plan the layout around them. Your full pictures are placed in afterwards.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-size">Size</Label>
            <select id="ai-size" value={size} onChange={(e) => setSize(e.target.value)} disabled={busy} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {SIZE_PRESETS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} — {s.note}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void generate()} disabled={busy || prompt.trim().length < 8}>
            <Sparkles className="size-4" /> {working === "designing" ? "Designing… (about 20 seconds)" : working === "saving" ? "Saving…" : "Design it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
