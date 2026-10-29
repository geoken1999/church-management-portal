"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Image as ImageIcon, Lock, Minus, Plus, Redo2, Square, Circle, Type, Undo2, Save, Building2, Layers, Check } from "lucide-react";
import { saveDesign } from "@/lib/designer/actions";
import {
  MAX_ELEMENTS,
  MIN_SIZE,
  backgroundCss,
  clamp,
  duplicateElement,
  makeImage,
  makeShape,
  makeText,
  reorder,
  type DesignBackground,
  type DesignDoc,
  type DesignElement,
} from "@/lib/designer/model";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";
import { ElementBody, elementStyle } from "./DesignView";
import { ElementProperties, PageProperties } from "./Properties";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};
const HANDLE_CURSOR: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const HISTORY_LIMIT = 60;
const AUTOSAVE_MS = 3000;
const SNAP_PX = 6;

type Mode = "move" | "rotate" | Handle;
type Status = "saved" | "saving" | "unsaved" | "error";

const rad = (deg: number) => (deg * Math.PI) / 180;

// Reads a picture, shrinks it so the saved design stays light, and returns it as an embedded data URL.
async function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That picture couldn't be opened."));
      image.src = bitmapUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser can't process pictures.");
    ctx.drawImage(img, 0, 0, w, h);
    // Keep transparency for PNGs unless that makes the picture too heavy.
    let src = file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
    if (src.length > 2_000_000) src = canvas.toDataURL("image/jpeg", 0.8);
    return { src, w, h };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function fileSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";
}

export function DesignerEditor({
  designId,
  initialName,
  initialDoc,
  canWrite,
  logoUrl,
  churchName,
}: {
  designId: string;
  initialName: string;
  initialDoc: DesignDoc;
  canWrite: boolean;
  logoUrl: string | null;
  churchName: string;
}) {
  const [doc, setDocState] = useState<DesignDoc>(initialDoc);
  const [name, setNameState] = useState(initialName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [workspace, setWorkspace] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [tab, setTab] = useState<"add" | "layers">("add");
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const docRef = useRef(doc);
  const pastRef = useRef<DesignDoc[]>([]);
  const futureRef = useRef<DesignDoc[]>([]);
  const nameRef = useRef(name);
  const revRef = useRef(0);
  const coalesce = useRef({ key: "", at: 0 });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readOnly = !canWrite;
  const fit = Math.min((workspace.w - 48) / doc.width, (workspace.h - 48) / doc.height, 1.5);
  const scale = Math.max(0.05, fit * zoom);
  const selected = doc.elements.find((e) => e.id === selectedId) ?? null;

  // --- document changes -------------------------------------------------------------------------------------------

  const syncHistory = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  // Remembers the page as it is now, so the next change can be undone.
  const pushHistory = useCallback(() => {
    pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), docRef.current];
    futureRef.current = [];
    syncHistory();
  }, [syncHistory]);

  const commit = useCallback(
    (next: DesignDoc, record: boolean | string) => {
      if (record) {
        const key = typeof record === "string" ? record : "";
        const now = Date.now();
        const sameBurst = key !== "" && coalesce.current.key === key && now - coalesce.current.at < 1000;
        if (!sameBurst) pushHistory();
        coalesce.current = { key, at: now };
      }
      docRef.current = next;
      revRef.current += 1;
      setDocState(next);
      setRev(revRef.current);
    },
    [pushHistory],
  );

  const patchElement = useCallback(
    (id: string, patch: Partial<DesignElement>, record: boolean | string = true) => {
      const current = docRef.current;
      commit({ ...current, elements: current.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }, record);
    },
    [commit],
  );

  const addElement = useCallback(
    (el: DesignElement) => {
      const current = docRef.current;
      if (current.elements.length >= MAX_ELEMENTS) {
        setError(`A design can have up to ${MAX_ELEMENTS} elements.`);
        return;
      }
      commit({ ...current, elements: [...current.elements, el] }, true);
      setSelectedId(el.id);
    },
    [commit],
  );

  const removeElement = useCallback(
    (id: string) => {
      const current = docRef.current;
      commit({ ...current, elements: current.elements.filter((e) => e.id !== id) }, true);
      setSelectedId(null);
    },
    [commit],
  );

  const duplicateSelected = useCallback(() => {
    const el = docRef.current.elements.find((e) => e.id === selectedId);
    if (el) addElement(duplicateElement(el));
  }, [selectedId, addElement]);

  const setName = (value: string) => {
    nameRef.current = value;
    setNameState(value);
    revRef.current += 1;
    setRev(revRef.current);
  };

  const jumpTo = useCallback(
    (target: DesignDoc) => {
      docRef.current = target;
      setDocState(target);
      revRef.current += 1;
      setRev(revRef.current);
      coalesce.current = { key: "", at: 0 };
      syncHistory();
    },
    [syncHistory],
  );

  const undo = useCallback(() => {
    const previous = pastRef.current[pastRef.current.length - 1];
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [docRef.current, ...futureRef.current];
    jumpTo(previous);
  }, [jumpTo]);

  const redo = useCallback(() => {
    const [next, ...rest] = futureRef.current;
    if (!next) return;
    futureRef.current = rest;
    pastRef.current = [...pastRef.current, docRef.current];
    jumpTo(next);
  }, [jumpTo]);

  // --- saving -----------------------------------------------------------------------------------------------------

  const save = useCallback(async () => {
    if (!canWrite) return;
    const startRev = revRef.current;
    setSaving(true);
    const result = await saveDesign({ id: designId, name: nameRef.current, doc: docRef.current });
    setSaving(false);
    if (result.error) {
      setSaveFailed(true);
      setError(result.error);
    } else {
      setSaveFailed(false);
      setSavedRev(startRev);
    }
  }, [canWrite, designId]);

  useEffect(() => {
    if (!canWrite || rev === savedRev || saveFailed) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [rev, savedRev, saveFailed, canWrite, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (revRef.current !== savedRev && canWrite) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [savedRev, canWrite]);

  const status: Status = saving ? "saving" : saveFailed ? "error" : rev === savedRev ? "saved" : "unsaved";

  // --- workspace size ---------------------------------------------------------------------------------------------

  useLayoutEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;
    const measure = () => setWorkspace({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A text box is as tall as its words. Measure the selected one so its outline matches.
  const selectedText = selected?.type === "text" ? selected : null;
  const textKey = selectedText
    ? `${selectedText.text}|${selectedText.w}|${selectedText.fontSize}|${selectedText.fontFamily}|${selectedText.fontWeight}|${selectedText.lineHeight}|${selectedText.letterSpacing}|${selectedText.italic}|${selectedText.uppercase}`
    : "";
  useEffect(() => {
    if (!selectedId || !textKey) return;
    const node = exportRef.current?.querySelector(`[data-el="${selectedId}"] [data-text]`) as HTMLElement | null;
    if (!node) return;
    const height = Math.max(MIN_SIZE, Math.ceil(node.offsetHeight));
    const el = docRef.current.elements.find((e) => e.id === selectedId);
    if (el && Math.abs(el.h - height) >= 1) patchElement(selectedId, { h: height }, false);
  }, [selectedId, textKey, patchElement]);

  // --- keyboard ---------------------------------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing || readOnly) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeElement(selectedId);
      } else if (selectedId && e.key.startsWith("Arrow")) {
        const el = docRef.current.elements.find((x) => x.id === selectedId);
        if (!el || el.locked) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const patch: Partial<DesignElement> = {};
        if (e.key === "ArrowLeft") patch.x = el.x - step;
        if (e.key === "ArrowRight") patch.x = el.x + step;
        if (e.key === "ArrowUp") patch.y = el.y - step;
        if (e.key === "ArrowDown") patch.y = el.y + step;
        patchElement(selectedId, patch, "nudge");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo, duplicateSelected, removeElement, patchElement, selectedId, readOnly]);

  // --- dragging ---------------------------------------------------------------------------------------------------

  function beginDrag(event: ReactPointerEvent, el: DesignElement, mode: Mode) {
    if (readOnly || el.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const s = scale;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...el };
    let started = false;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / s;
      const dy = (ev.clientY - startY) / s;
      if (!started) {
        if (Math.abs(dx) + Math.abs(dy) < 2 / s) return;
        started = true;
        pushHistory();
        coalesce.current = { key: "", at: 0 };
      }
      const page = docRef.current;
      let patch: Partial<DesignElement> = {};

      if (mode === "move") {
        let x = origin.x + dx;
        let y = origin.y + dy;
        const snapV = Math.abs(x + origin.w / 2 - page.width / 2) < SNAP_PX / s;
        const snapH = Math.abs(y + origin.h / 2 - page.height / 2) < SNAP_PX / s;
        if (snapV) x = page.width / 2 - origin.w / 2;
        if (snapH) y = page.height / 2 - origin.h / 2;
        setGuides({ v: snapV, h: snapH });
        patch = { x: Math.round(x), y: Math.round(y) };
      } else if (mode === "rotate") {
        const cx = origin.x + origin.w / 2;
        const cy = origin.y + origin.h / 2;
        const px = (ev.clientX - rect.left) / s;
        const py = (ev.clientY - rect.top) / s;
        let angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
        if (angle > 180) angle -= 360;
        if (ev.shiftKey) angle = Math.round(angle / 15) * 15;
        else {
          const nearest = Math.round(angle / 90) * 90;
          if (Math.abs(angle - nearest) < 4) angle = nearest;
        }
        patch = { rotation: Math.round(angle) };
      } else {
        const [sx, sy] = HANDLES[mode];
        const cos = Math.cos(rad(origin.rotation));
        const sin = Math.sin(rad(origin.rotation));
        const ldx = dx * cos + dy * sin;
        const ldy = -dx * sin + dy * cos;
        let nw = origin.w + sx * ldx;
        let nh = origin.h + sy * ldy;
        const keepRatio = origin.type === "image" ? !ev.altKey : ev.shiftKey;
        if (keepRatio && sx !== 0 && sy !== 0) {
          const ratio = origin.w / origin.h;
          if (Math.abs(nw / origin.w) >= Math.abs(nh / origin.h)) nh = nw / ratio;
          else nw = nh * ratio;
        }
        nw = Math.max(MIN_SIZE, nw);
        nh = Math.max(MIN_SIZE, nh);
        if (sx === 0) nw = origin.w;
        if (sy === 0) nh = origin.h;
        if (origin.type === "text") nh = origin.h; // the words decide the height
        const dw = nw - origin.w;
        const dh = nh - origin.h;
        const lcx = (sx * dw) / 2;
        const lcy = (sy * dh) / 2;
        const cx = origin.x + origin.w / 2 + lcx * cos - lcy * sin;
        const cy = origin.y + origin.h / 2 + lcx * sin + lcy * cos;
        patch = { x: Math.round(cx - nw / 2), y: Math.round(cy - nh / 2), w: Math.round(nw), h: Math.round(nh) };
        // Dragging a corner of a text box makes the writing bigger or smaller, like other design tools.
        if (origin.type === "text" && sx !== 0 && sy !== 0) {
          patch.fontSize = clamp(Math.round((origin.fontSize ?? 32) * (nw / origin.w)), 4, 600);
        }
      }
      patchElement(origin.id, patch, false);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setGuides({ v: false, h: false });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // --- adding things ----------------------------------------------------------------------------------------------

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setError("Use a PNG, JPG, WebP or GIF picture.");
      return;
    }
    try {
      const { src, w, h } = await readImage(file);
      addElement(makeImage(docRef.current, src, w, h));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture couldn't be added.");
    }
  }

  function addLogo() {
    if (!logoUrl) return;
    const probe = new window.Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => addElement(makeImage(docRef.current, logoUrl, probe.naturalWidth || 400, probe.naturalHeight || 400));
    probe.onerror = () => setError("Your logo couldn't be loaded.");
    probe.src = logoUrl;
  }

  function addText(kind: "heading" | "sub" | "body") {
    const page = docRef.current;
    const size = kind === "heading" ? 0.09 : kind === "sub" ? 0.055 : 0.032;
    const label = kind === "heading" ? "Add a heading" : kind === "sub" ? "Add a subheading" : "Add a little text";
    const fontSize = Math.round(page.width * size);
    addElement(makeText(page, label, { fontSize, h: Math.round(fontSize * 1.3), fontWeight: kind === "body" ? 400 : 700, fontFamily: kind === "heading" ? "display" : "sans" }));
    setTimeout(() => document.getElementById("design-text-input")?.focus(), 50);
  }

  // --- export -----------------------------------------------------------------------------------------------------

  async function exportAs(format: "png" | "png2" | "jpg" | "pdf") {
    const node = exportRef.current;
    if (!node) return;
    setExporting(true);
    setExportOpen(false);
    setSelectedId(null);
    try {
      const page = docRef.current;
      const { toPng, toJpeg } = await import("html-to-image");
      const options = {
        width: page.width,
        height: page.height,
        pixelRatio: format === "png" || format === "jpg" ? 1 : 2,
        style: { transform: "none", left: "0", top: "0" },
        backgroundColor: "#ffffff",
      };
      const dataUrl = format === "jpg" ? await toJpeg(node, { ...options, quality: 0.92 }) : await toPng(node, options);
      const slug = fileSlug(nameRef.current);
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        // The page is drawn at 96 pixels to the inch, so A4 comes out as A4.
        const wMm = (page.width * 25.4) / 96;
        const hMm = (page.height * 25.4) / 96;
        const pdf = new jsPDF({ unit: "mm", format: [wMm, hMm], orientation: wMm > hMm ? "landscape" : "portrait" });
        pdf.addImage(dataUrl, "PNG", 0, 0, wMm, hMm);
        pdf.save(`${slug}.pdf`);
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `${slug}.${format === "jpg" ? "jpg" : "png"}`;
        link.click();
      }
    } catch {
      setError("Couldn't create the download. If you used a picture from the web, upload it again from your computer.");
    } finally {
      setExporting(false);
    }
  }

  // --- render -----------------------------------------------------------------------------------------------------

  const onBackground = (background: DesignBackground, key: string) => commit({ ...docRef.current, background }, key);
  const reversed = doc.elements.slice().reverse();

  return (
    <div className="space-y-3">
      <ErrorToast message={error} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void onPickImage(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/media/designer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft className="size-4" /> Designs
        </Link>
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {readOnly ? "View only" : status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved" : "Unsaved changes"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!readOnly && (
            <>
              <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
                <Undo2 className="size-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <Redo2 className="size-4" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => clamp(Math.round((z - 0.25) * 100) / 100, 0.25, 3))} aria-label="Zoom out">
            <Minus className="size-4" />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="w-14 text-center text-xs text-muted-foreground" title="Fit to screen">
            {Math.round(scale * 100)}%
          </button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => clamp(Math.round((z + 0.25) * 100) / 100, 0.25, 3))} aria-label="Zoom in">
            <Plus className="size-4" />
          </Button>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving || status === "saved"}>
              <Save className="size-4" /> Save
            </Button>
          )}
          <div className="relative">
            <Button size="sm" onClick={() => setExportOpen((o) => !o)} disabled={exporting}>
              <Download className="size-4" /> {exporting ? "Preparing…" : "Download"}
            </Button>
            {exportOpen && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border bg-popover p-1 text-sm shadow-lg">
                {[
                  ["png", "PNG image", `${doc.width} × ${doc.height}`],
                  ["png2", "PNG, high quality", `${doc.width * 2} × ${doc.height * 2}, for printing`],
                  ["jpg", "JPG image", "Smaller file"],
                  ["pdf", "PDF", "Print-ready at the page size"],
                ].map(([key, label, note]) => (
                  <button key={key} type="button" onClick={() => void exportAs(key as "png" | "png2" | "jpg" | "pdf")} className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted">
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{note}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)_270px]">
        {/* Left: add things, layers */}
        <aside className="order-2 space-y-3 rounded-lg border bg-card p-3 lg:order-1">
          <div className="flex gap-1">
            <button type="button" onClick={() => setTab("add")} className={`flex-1 rounded-md px-2 py-1 text-sm ${tab === "add" ? "bg-muted font-medium" : ""}`}>
              Add
            </button>
            <button type="button" onClick={() => setTab("layers")} className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-sm ${tab === "layers" ? "bg-muted font-medium" : ""}`}>
              <Layers className="size-3.5" /> Layers
            </button>
          </div>
          {tab === "add" ? (
            readOnly ? (
              <p className="text-sm text-muted-foreground">You can view this design but not change it.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text</p>
                <button type="button" onClick={() => addText("heading")} className="w-full rounded-md border px-3 py-2 text-left text-xl font-black hover:bg-muted">
                  Heading
                </button>
                <button type="button" onClick={() => addText("sub")} className="w-full rounded-md border px-3 py-2 text-left text-base font-bold hover:bg-muted">
                  Subheading
                </button>
                <button type="button" onClick={() => addText("body")} className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">
                  A little text
                </button>
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shapes</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" onClick={() => addElement(makeShape("rect", docRef.current))} aria-label="Add rectangle" title="Rectangle">
                    <Square className="size-4" />
                  </Button>
                  <Button variant="outline" onClick={() => addElement(makeShape("ellipse", docRef.current))} aria-label="Add circle" title="Circle">
                    <Circle className="size-4" />
                  </Button>
                  <Button variant="outline" onClick={() => addElement(makeShape("line", docRef.current, { fill: "#111111" }))} aria-label="Add line" title="Line">
                    <Minus className="size-4" />
                  </Button>
                </div>
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pictures</p>
                <Button variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
                  <ImageIcon className="size-4" /> Upload a picture
                </Button>
                {logoUrl && (
                  <Button variant="outline" className="w-full justify-start" onClick={addLogo}>
                    <Building2 className="size-4" /> Add {churchName ? `${churchName} logo` : "our logo"}
                  </Button>
                )}
              </div>
            )
          ) : (
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
              {reversed.length === 0 && <li className="text-sm text-muted-foreground">Nothing on the page yet.</li>}
              {reversed.map((el) => (
                <li key={el.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(el.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${el.id === selectedId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
                  >
                    {el.type === "text" ? <Type className="size-3.5 shrink-0" /> : el.type === "image" ? <ImageIcon className="size-3.5 shrink-0" /> : el.type === "ellipse" ? <Circle className="size-3.5 shrink-0" /> : el.type === "line" ? <Minus className="size-3.5 shrink-0" /> : <Square className="size-3.5 shrink-0" />}
                    <span className="truncate">{el.type === "text" ? (el.text || "Text").split("\n")[0] : el.type === "image" ? "Picture" : el.type === "rect" ? "Rectangle" : el.type === "ellipse" ? "Circle" : "Line"}</span>
                    {el.locked && <Lock className="ml-auto size-3 shrink-0 text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Centre: the page */}
        <div
          ref={workspaceRef}
          className="relative order-1 h-[68vh] min-h-[360px] overflow-auto rounded-lg border bg-muted/60 lg:order-2"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.stageWrap) setSelectedId(null);
          }}
        >
          <div data-stage-wrap="1" className="flex min-h-full min-w-full items-center justify-center p-6">
            <div ref={stageRef} className="relative shadow-xl" style={{ width: doc.width * scale, height: doc.height * scale }} onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
              {/* The page itself, at its natural size, scaled to fit. This is what gets downloaded. */}
              <div
                ref={exportRef}
                style={{
                  width: doc.width,
                  height: doc.height,
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  background: backgroundCss(doc.background),
                  overflow: "hidden",
                }}
                onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
              >
                {doc.elements.map((el) => (
                  <div
                    key={el.id}
                    data-el={el.id}
                    style={{ ...elementStyle(el), cursor: readOnly || el.locked ? "default" : "move" }}
                    onPointerDown={(e) => {
                      setSelectedId(el.id);
                      beginDrag(e, el, "move");
                    }}
                  >
                    <ElementBody el={el} />
                  </div>
                ))}
              </div>

              {/* Centre guides while dragging */}
              {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-fuchsia-500" />}
              {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-fuchsia-500" />}

              {/* Selection outline and handles */}
              {selected && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: selected.x * scale,
                    top: selected.y * scale,
                    width: selected.w * scale,
                    height: selected.h * scale,
                    transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined,
                    border: "1.5px solid #3b82f6",
                    boxSizing: "border-box",
                  }}
                >
                  {!readOnly && !selected.locked && (
                    <>
                      {(Object.keys(HANDLES) as Handle[])
                        .filter((h) => !(selected.type === "text" && (h === "n" || h === "s")))
                        .map((h) => {
                          const [hx, hy] = HANDLES[h];
                          return (
                            <span
                              key={h}
                              onPointerDown={(e) => beginDrag(e, selected, h)}
                              className="pointer-events-auto absolute size-2.5 rounded-sm border border-blue-500 bg-white"
                              style={{ left: `${(hx + 1) * 50}%`, top: `${(hy + 1) * 50}%`, transform: "translate(-50%, -50%)", cursor: HANDLE_CURSOR[h] }}
                            />
                          );
                        })}
                      <span
                        onPointerDown={(e) => beginDrag(e, selected, "rotate")}
                        className="pointer-events-auto absolute size-3 rounded-full border border-blue-500 bg-white"
                        style={{ left: "50%", top: -22, transform: "translateX(-50%)", cursor: "grab" }}
                        title="Rotate (hold Shift for 15° steps)"
                      />
                    </>
                  )}
                  {selected.locked && <Lock className="absolute -right-5 -top-5 size-4 text-blue-500" />}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: properties */}
        <aside className="order-3 rounded-lg border bg-card p-3">
          {selected ? (
            readOnly ? (
              <p className="text-sm text-muted-foreground">You can view this design but not change it.</p>
            ) : (
              <ElementProperties
                el={selected}
                onPatch={(patch, key) => patchElement(selected.id, patch, key)}
                onLayer={(move) => commit({ ...docRef.current, elements: reorder(docRef.current.elements, selected.id, move) }, true)}
                onDuplicate={duplicateSelected}
                onDelete={() => removeElement(selected.id)}
              />
            )
          ) : (
            <PageProperties doc={doc} name={name} onName={setName} onBackground={onBackground} readOnly={readOnly} />
          )}
        </aside>
      </div>
      {status === "saved" && !readOnly && rev > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3" /> All changes are saved automatically.
        </p>
      )}
      {readOnly && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          You can open and download designs, but only people with Media write access can change them.
        </p>
      )}
    </div>
  );
}
