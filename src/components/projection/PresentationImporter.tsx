"use client";

import { useRef, useState } from "react";
import { FileUp, ImagePlus, Loader2 } from "lucide-react";
import { savePresentationAction, saveItemAction, startSlideUploadAction } from "@/lib/projection/actions";
import { drawPresentation, type Drawn } from "@/lib/projection/pptx-draw";
import { extractSlideTexts } from "@/lib/projection/pptx-text";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.85;

// A picture file, scaled down to a sensible size and saved as a JPEG.
async function drawImageFile(file: File): Promise<Drawn> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare pictures.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Couldn't prepare that picture.");
  return { blob, url: URL.createObjectURL(blob), text: "", width: canvas.width, height: canvas.height };
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function PresentationImporter({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<Drawn[]>([]);
  const [pptxFile, setPptxFile] = useState<File | null>(null);

  async function choose(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setSlides([]);
    setPptxFile(null);
    const list = [...files].sort((a, b) => naturalCompare(a.name, b.name));
    try {
      const first = list[0];
      if (list.length === 1 && /\.pptx$/i.test(first.name)) {
        setTitle(first.name.replace(/\.pptx$/i, ""));
        setPptxFile(first);
        setBusy("Drawing the slides… this can take a minute for a long presentation.");
        setSlides(await drawPresentation(await first.arrayBuffer(), (done, total) => setBusy(`Drawing slide ${Math.min(done + 1, total)} of ${total}…`)));
      } else if (list.every((f) => f.type.startsWith("image/"))) {
        setTitle(list.length === 1 ? first.name.replace(/\.[a-z0-9]+$/i, "") : "");
        setBusy("Preparing the pictures…");
        const drawn: Drawn[] = [];
        for (const f of list) drawn.push(await drawImageFile(f));
        setSlides(drawn);
      } else if (/\.ppt$/i.test(first.name)) {
        setError("This is an older .ppt file. In PowerPoint choose File → Save As → PowerPoint Presentation (.pptx), then add that file.");
      } else {
        setError("Add one PowerPoint (.pptx) file, or several pictures (JPG or PNG) in slide order.");
      }
    } catch {
      setError("Couldn't draw this presentation. You can still add its words only, or export the slides from PowerPoint as pictures (File → Export → PNG) and add those.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function textOnly() {
    if (!pptxFile) return;
    setError(null);
    setBusy("Reading the words…");
    try {
      const texts = (await extractSlideTexts(await pptxFile.arrayBuffer())).filter(Boolean);
      if (texts.length === 0) {
        setError("No words were found in this presentation.");
        return;
      }
      const result = await saveItemAction({ kind: "song", title: title.trim() || pptxFile.name.replace(/\.pptx$/i, ""), body: texts.join("\n\n") });
      if (result.error) setError(result.error);
      else onDone();
    } catch {
      setError("Couldn't read this file.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!title.trim()) return setError("Give the presentation a title.");
    setError(null);
    try {
      setBusy("Starting the upload…");
      const start = await startSlideUploadAction(slides.length, slides.reduce((sum, s) => sum + s.blob.size, 0));
      if (start.error || !start.slots) return setError(start.error ?? "Couldn't start the upload.");
      const storage = createBrowserClient().storage.from("projection-slides");
      for (let i = 0; i < slides.length; i++) {
        setBusy(`Uploading slide ${i + 1} of ${slides.length}…`);
        const { error: uploadError } = await storage.uploadToSignedUrl(start.slots[i].path, start.slots[i].token, slides[i].blob, { contentType: "image/jpeg" });
        if (uploadError) return setError(`The upload failed (${uploadError.message}). Check your connection and try again.`);
      }
      setBusy("Saving…");
      const saved = await savePresentationAction(title, slides.map((s, i) => ({ path: start.slots![i].path, text: s.text })));
      if (saved.error) return setError(saved.error);
      onDone();
    } catch {
      setError("Something went wrong while uploading. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="font-medium">Add a PowerPoint or pictures</p>
        <p className="text-sm text-muted-foreground">Each slide is shown across the whole screen. Choose one .pptx file, or several pictures in slide order.</p>
      </div>
      <input ref={input} type="file" accept=".pptx,.ppt,image/png,image/jpeg,image/webp" multiple className="sr-only" id="pj-file" onChange={(e) => choose(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
          <FileUp className="size-4" /> Choose a file
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy !== null}>
          Cancel
        </Button>
      </div>
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {pptxFile && !busy && slides.length === 0 && error && (
        <Button type="button" size="sm" variant="outline" onClick={textOnly}>
          Add the words only
        </Button>
      )}
      {slides.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pj-ptitle">Title</Label>
            <Input id="pj-ptitle" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {slides.length} slide{slides.length === 1 ? "" : "s"}. Check they look right before saving.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slides.map((slide, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={slide.url} alt={slide.text || `Slide ${i + 1}`} className="w-full rounded border border-border" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={busy !== null}>
              <ImagePlus className="size-4" /> Save {slides.length} slide{slides.length === 1 ? "" : "s"}
            </Button>
            {pptxFile && (
              <Button type="button" variant="outline" onClick={textOnly} disabled={busy !== null}>
                Add the words only instead
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
