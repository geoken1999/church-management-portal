"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, CalendarDays, Link2, Megaphone, Sparkles, ImageIcon } from "lucide-react";
import { saveHomeDraftAction, publishHomeLayoutAction, discardHomeDraftAction, uploadBannerImageAction } from "@/lib/member-home/actions";
import { BannerCropDialog } from "@/components/mobile/BannerCropDialog";
import {
  BANNER_AUTOPLAY_OPTIONS,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  BLOCK_TYPE_LABELS,
  MAX_BANNER_SLIDES,
  bannerImageUrl,
  DEFAULT_LAYOUT,
  MAX_BLOCKS,
  MAX_QUICK_LINKS,
  QUICK_LINK_ICONS,
  QUICK_LINK_TARGETS,
  newBlock,
  sanitizeLayout,
  type BlockType,
  type HomeBlock,
  type HomeLayout,
  type QuickLink,
} from "@/lib/member-home/schema";
import type { MemberHomeState } from "@/lib/member-home/dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

const BLOCK_ICONS: Record<BlockType, typeof Sparkles> = {
  banner: ImageIcon,
  welcome: Sparkles,
  announcement: Megaphone,
  quick_links: Link2,
  upcoming_events: CalendarDays,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}


const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function BannerEditor({ block, onChange }: { block: Extract<HomeBlock, { type: "banner" }>; onChange: (next: HomeBlock) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setBitmap(await createImageBitmap(file));
    } catch {
      setError("That file couldn't be read as an image.");
    }
  }

  function handleCropped(file: File) {
    setBitmap(null);
    const data = new FormData();
    data.append("image", file);
    startUpload(async () => {
      const result = await uploadBannerImageAction(data);
      if (result.error || !result.imagePath) {
        setError(result.error ?? "Couldn't upload that image.");
        return;
      }
      // Autoplay was stored as off while there was a single image; turn
      // it on when this makes it a carousel (it can still be set to Off).
      const slides = [...block.slides, { imagePath: result.imagePath, linkUrl: "" }];
      onChange({ ...block, slides, autoplaySeconds: slides.length === 2 && block.autoplaySeconds === 0 ? 5 : block.autoplaySeconds });
    });
  }

  const setSlide = (index: number, linkUrl: string) =>
    onChange({ ...block, slides: block.slides.map((slide, i) => (i === index ? { ...slide, linkUrl } : slide)) });
  const moveSlide = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= block.slides.length) return;
    const slides = [...block.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    onChange({ ...block, slides });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Images are cropped to {BANNER_WIDTH}×{BANNER_HEIGHT} (2:1). Add up to {MAX_BANNER_SLIDES}; more than one becomes a carousel. Uploads count toward your storage.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {block.slides.map((slide, index) => (
        <div key={slide.imagePath} className="flex gap-3 rounded-md border border-border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerImageUrl(SUPABASE_URL, slide.imagePath)} alt="" className="aspect-[2/1] w-32 shrink-0 rounded object-cover" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input placeholder="Optional link when tapped (https://…)" value={slide.linkUrl} maxLength={500} onChange={(e) => setSlide(index, e.target.value)} />
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => moveSlide(index, -1)} disabled={index === 0} aria-label="Move image earlier">
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => moveSlide(index, 1)} disabled={index === block.slides.length - 1} aria-label="Move image later">
                <ArrowDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange({ ...block, slides: block.slides.filter((_, i) => i !== index) })} aria-label="Remove image">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {block.slides.length < MAX_BANNER_SLIDES && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Plus className="size-4" /> {uploading ? "Uploading..." : "Add image"}
            </Button>
          </>
        )}
        {block.slides.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Auto-advance</Label>
            <Select value={String(block.autoplaySeconds)} onValueChange={(v) => onChange({ ...block, autoplaySeconds: Number(v) })}>
              <SelectTrigger className="w-32">
                <SelectValue>{() => (block.autoplaySeconds === 0 ? "Off" : `Every ${block.autoplaySeconds}s`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BANNER_AUTOPLAY_OPTIONS.map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {seconds === 0 ? "Off" : `Every ${seconds}s`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <BannerCropDialog bitmap={bitmap} onCancel={() => setBitmap(null)} onConfirm={handleCropped} />
    </div>
  );
}

function BannerPreview({ block }: { block: Extract<HomeBlock, { type: "banner" }> }) {
  const [index, setIndex] = useState(0);
  const count = block.slides.length;
  const current = count === 0 ? 0 : index % count;

  useEffect(() => {
    if (count < 2 || block.autoplaySeconds === 0) return;
    const timer = setInterval(() => setIndex((i) => i + 1), block.autoplaySeconds * 1000);
    return () => clearInterval(timer);
  }, [count, block.autoplaySeconds]);

  if (count === 0) {
    return <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-muted text-[10px] text-muted-foreground">Banner image</div>;
  }
  return (
    <div className="relative aspect-[2/1] overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bannerImageUrl(SUPABASE_URL, block.slides[current].imagePath)} alt="" className="size-full object-cover" />
      {count > 1 && (
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
          {block.slides.map((_, i) => (
            <span key={i} className={`size-1.5 rounded-full ${i === current ? "bg-white" : "bg-white/50"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockEditor({ block, onChange }: { block: HomeBlock; onChange: (next: HomeBlock) => void }) {
  switch (block.type) {
    case "banner":
      return <BannerEditor block={block} onChange={onChange} />;
    case "welcome":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (blank = “Welcome, {first name}!”)">
            <Input value={block.title} maxLength={80} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </Field>
          <Field label="Subtitle (blank = church name)">
            <Input value={block.subtitle} maxLength={160} onChange={(e) => onChange({ ...block, subtitle: e.target.value })} />
          </Field>
        </div>
      );
    case "announcement":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input value={block.title} maxLength={80} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </Field>
          <Field label="Image link (https://…, optional)">
            <Input value={block.imageUrl} maxLength={500} onChange={(e) => onChange({ ...block, imageUrl: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Message">
              <Textarea value={block.body} maxLength={1000} rows={3} onChange={(e) => onChange({ ...block, body: e.target.value })} />
            </Field>
          </div>
          <Field label="Button label (optional)">
            <Input value={block.buttonLabel} maxLength={30} onChange={(e) => onChange({ ...block, buttonLabel: e.target.value })} />
          </Field>
          <Field label="Button link (https://…)">
            <Input value={block.buttonUrl} maxLength={500} onChange={(e) => onChange({ ...block, buttonUrl: e.target.value })} />
          </Field>
        </div>
      );
    case "upcoming_events":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Heading">
            <Input value={block.title} maxLength={60} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </Field>
          <Field label="How many events (1–10)">
            <Input type="number" min={1} max={10} value={block.count} onChange={(e) => onChange({ ...block, count: Number(e.target.value) || 1 })} />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Pulled automatically from your Events calendar, soonest first.</p>
        </div>
      );
    case "quick_links": {
      const setLink = (index: number, patch: Partial<QuickLink>) =>
        onChange({ ...block, links: block.links.map((link, i) => (i === index ? { ...link, ...patch } : link)) });
      return (
        <div className="space-y-3">
          <Field label="Heading (optional)">
            <Input value={block.title} maxLength={60} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </Field>
          {block.links.map((link, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_8rem_12rem_auto]">
              <Input placeholder="Label" value={link.label} maxLength={24} onChange={(e) => setLink(index, { label: e.target.value })} />
              <Select value={link.icon} onValueChange={(v) => setLink(index, { icon: (v ?? "link") as QuickLink["icon"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => link.icon}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {QUICK_LINK_ICONS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={link.target} onValueChange={(v) => setLink(index, { target: (v ?? "membership") as QuickLink["target"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => QUICK_LINK_TARGETS.find((t) => t.key === link.target)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {QUICK_LINK_TARGETS.map((target) => (
                    <SelectItem key={target.key} value={target.key}>
                      {target.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange({ ...block, links: block.links.filter((_, i) => i !== index) })} aria-label="Remove link">
                <Trash2 className="size-4" />
              </Button>
              {link.target === "url" && (
                <div className="sm:col-span-4">
                  <Input placeholder="https://…" value={link.url ?? ""} maxLength={500} onChange={(e) => setLink(index, { url: e.target.value })} />
                </div>
              )}
            </div>
          ))}
          {block.links.length < MAX_QUICK_LINKS && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...block, links: [...block.links, { label: "", icon: "link", target: "my_details" }] })}>
              <Plus className="size-4" /> Add link
            </Button>
          )}
        </div>
      );
    }
  }
}

// A rough picture of the phone's Home tab, not pixel-exact: it shows the
// content and order members will see.
function PhonePreview({ layout, organizationName, logoUrl }: { layout: HomeLayout; organizationName: string; logoUrl: string | null }) {
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[2rem] border-4 border-foreground/80 bg-background shadow-lg">
      <div className="bg-muted px-4 py-3 text-center text-sm font-semibold">Home</div>
      <div className="h-[520px] space-y-3 overflow-y-auto p-3">
        {layout.blocks.map((block) => {
          switch (block.type) {
            case "banner":
              return <BannerPreview key={block.id} block={block} />;
            case "welcome":
              return (
                <div key={block.id} className="space-y-1 rounded-xl bg-accent p-4 text-center">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="mx-auto mb-2 size-14 rounded-full object-cover" />
                  ) : (
                    <div className="mx-auto mb-2 size-14 rounded-full bg-primary/20" />
                  )}
                  <p className="text-base font-bold">{block.title || "Welcome, Member!"}</p>
                  <p className="text-xs text-muted-foreground">{block.subtitle || organizationName}</p>
                </div>
              );
            case "announcement":
              return (
                <div key={block.id} className="overflow-hidden rounded-xl border border-border">
                  {block.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={block.imageUrl} alt="" className="h-24 w-full object-cover" />
                  )}
                  <div className="space-y-1.5 p-3">
                    {block.title && <p className="text-sm font-semibold">{block.title}</p>}
                    {block.body && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{block.body}</p>}
                    {block.buttonLabel && <span className="inline-block rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">{block.buttonLabel}</span>}
                  </div>
                </div>
              );
            case "quick_links":
              return (
                <div key={block.id} className="space-y-2">
                  {block.title && <p className="text-sm font-semibold">{block.title}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    {block.links.map((link, i) => (
                      <div key={i} className="flex flex-col items-center gap-1 rounded-lg bg-muted p-2 text-center">
                        <div className="size-7 rounded-full bg-primary/20" />
                        <span className="text-[10px] leading-tight">{link.label || "Link"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            case "upcoming_events":
              return (
                <div key={block.id} className="space-y-2">
                  {block.title && <p className="text-sm font-semibold">{block.title}</p>}
                  {Array.from({ length: Math.min(block.count, 3) }, (_, i) => (
                    <div key={i} className="rounded-lg border border-border p-2.5">
                      <p className="text-xs font-medium">Sample event {i + 1}</p>
                      <p className="text-[10px] text-muted-foreground">Sun, 6:00 PM</p>
                    </div>
                  ))}
                </div>
              );
          }
        })}
        {layout.blocks.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">Add a section to get started.</p>}
      </div>
    </div>
  );
}

export function DesignStudio({ organizationName, logoUrl, initial }: { organizationName: string; logoUrl: string | null; initial: MemberHomeState }) {
  const [layout, setLayout] = useState<HomeLayout>(initial.draft);
  const [savedJson, setSavedJson] = useState(JSON.stringify(initial.draft));
  const [publishedJson, setPublishedJson] = useState(JSON.stringify(initial.published ?? DEFAULT_LAYOUT));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const dirty = JSON.stringify(layout) !== savedJson;
  const unpublished = JSON.stringify(layout) !== publishedJson;

  function update(blocks: HomeBlock[]) {
    setLayout({ ...layout, blocks });
    setMessage(null);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= layout.blocks.length) return;
    const blocks = [...layout.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    update(blocks);
  }

  function run(action: () => Promise<{ error?: string }>, onDone: () => void, successText: string) {
    const check = sanitizeLayout(layout);
    if (check.error) {
      setMessage({ kind: "error", text: check.error });
      return;
    }
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      onDone();
      setMessage({ kind: "success", text: successText });
    });
  }

  const handleSave = () => run(() => saveHomeDraftAction(layout), () => setSavedJson(JSON.stringify(layout)), "Draft saved. Members won't see it until you publish.");
  const handlePublish = () =>
    run(
      () => publishHomeLayoutAction(layout),
      () => {
        setSavedJson(JSON.stringify(layout));
        setPublishedJson(JSON.stringify(layout));
      },
      "Published. Members see the new Home page next time the app opens or refreshes.",
    );

  function handleDiscard() {
    if (!window.confirm("Discard your draft and go back to what members currently see?")) return;
    startTransition(async () => {
      const result = await discardHomeDraftAction();
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setLayout(JSON.parse(publishedJson) as HomeLayout);
      setSavedJson(publishedJson);
      setMessage({ kind: "success", text: "Draft discarded." });
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handlePublish} disabled={pending || (!unpublished && !dirty)}>
            {pending ? "Working..." : "Publish"}
          </Button>
          <Button type="button" variant="outline" onClick={handleSave} disabled={pending || !dirty}>
            Save draft
          </Button>
          <Button type="button" variant="ghost" onClick={handleDiscard} disabled={pending || !unpublished}>
            Discard changes
          </Button>
          {dirty ? <Badge variant="secondary">Unsaved changes</Badge> : unpublished ? <Badge variant="secondary">Draft not published</Badge> : <Badge>Live</Badge>}
        </div>

        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {layout.blocks.map((block, index) => {
          const Icon = BLOCK_ICONS[block.type];
          return (
            <Card key={block.id}>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-primary" />
                    {BLOCK_TYPE_LABELS[block.type]}
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => move(index, 1)} disabled={index === layout.blocks.length - 1} aria-label="Move down">
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => update(layout.blocks.filter((b) => b.id !== block.id))} aria-label="Remove section">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <BlockEditor block={block} onChange={(next) => update(layout.blocks.map((b) => (b.id === block.id ? next : b)))} />
              </CardContent>
            </Card>
          );
        })}

        {layout.blocks.length < MAX_BLOCKS && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((type) => (
              <Button key={type} type="button" variant="outline" size="sm" onClick={() => update([...layout.blocks, newBlock(type)])}>
                <Plus className="size-4" /> {BLOCK_TYPE_LABELS[type]}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Preview</p>
        <PhonePreview layout={layout} organizationName={organizationName} logoUrl={logoUrl} />
      </div>
    </div>
  );
}
