"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Copy, EyeOff, ExternalLink, FileUp, ImagePlus, ListPlus, Monitor, MonitorOff, Music, Plus, Search, Trash2, X } from "lucide-react";
import {
  deleteItemAction,
  deleteTranslationAction,
  importTranslationAction,
  lookupPassageAction,
  regenerateTokenAction,
  saveItemAction,
  searchVersesAction,
  setModeAction,
  setThemeAction,
  setVisibleAction,
  showSlideAction,
  startSlideUploadAction,
} from "@/lib/projection/actions";
import { parseReference } from "@/lib/projection/reference";
import { itemSlides, MAX_COMPARED, type Slide } from "@/lib/projection/slides";
import { withDefaults } from "@/lib/projection/theme";
import type { VerseHit } from "@/lib/projection/bible";
import type { ProjectionItem, ProjectionSlide, ProjectionTheme } from "@/types/database";
import { SlideView } from "@/components/projection/SlideView";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { PresentationImporter } from "@/components/projection/PresentationImporter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** A library item; a presentation also carries its slides as pictures, ready to show. */
export type ConsoleItem = ProjectionItem & { imageSlides?: Slide[] };

export interface ConsoleTranslation {
  key: string;
  name: string;
  /** Where it comes from, shown in the settings. */
  note?: string;
  /** Set for a translation the church added, which can be removed. */
  customId?: string;
}

interface ScreenState {
  visible: boolean;
  mode: "full" | "lower_third";
  slide: ProjectionSlide | null;
  theme: ProjectionTheme;
}

type Tab = "bible" | "library" | "settings";

// The operator's side of verse projection: look up a verse, pick a song slide or announcement, and put it on the screen.
export function ProjectionConsole({
  organizationId,
  token,
  siteUrl,
  initial,
  items,
  translations,
  canWrite,
}: {
  organizationId: string;
  token: string;
  siteUrl: string;
  initial: ScreenState;
  items: ConsoleItem[];
  translations: ConsoleTranslation[];
  canWrite: boolean;
}) {
  const [screen, setScreen] = useState(initial);
  const [tab, setTab] = useState<Tab>("bible");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [, start] = useTransition();

  // The order of service: slides lined up in advance. Kept in this browser.
  const queueKey = `kf-projection-queue:${organizationId}`;
  const [queue, setQueue] = useState<Slide[]>([]);
  useEffect(() => {
    // After the first paint, so the server and browser render the same thing.
    const timer = setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(queueKey);
        if (saved) setQueue(JSON.parse(saved) as Slide[]);
      } catch {
        // No storage: the order simply isn't remembered.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [queueKey]);
  const saveQueue = (next: Slide[]) => {
    setQueue(next);
    try {
      window.localStorage.setItem(queueKey, JSON.stringify(next));
    } catch {
      // Not remembered.
    }
  };

  const run = useCallback((task: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const result = await task();
      if (result.error) setError(result.error);
    });
  }, []);

  const project = useCallback(
    (slide: Slide) => {
      if (!canWrite) return;
      setScreen((s) => ({ ...s, slide, visible: true }));
      run(() => showSlideAction(slide));
    },
    [canWrite, run],
  );

  const toggleVisible = () => {
    const visible = !screen.visible;
    setScreen((s) => ({ ...s, visible }));
    run(() => setVisibleAction(visible));
  };
  const changeMode = (mode: "full" | "lower_third") => {
    setScreen((s) => ({ ...s, mode }));
    run(() => setModeAction(mode));
  };

  const projectorUrl = `${siteUrl}/projector/${token}`;
  const obsUrl = `${projectorUrl}?bg=transparent`;
  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border" style={{ aspectRatio: "16 / 9", background: withDefaults(screen.theme).background }}>
            <SlideView slide={screen.visible ? screen.slide : null} mode={screen.mode} theme={screen.theme} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {screen.visible && screen.slide ? <Monitor className="size-3.5 text-primary" /> : <MonitorOff className="size-3.5" />}
            {screen.visible && screen.slide ? `On screen: ${screen.slide.title}` : "Screen is blank"}
          </p>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={screen.visible ? "destructive" : "default"} onClick={toggleVisible} disabled={!screen.slide && !screen.visible}>
                {screen.visible ? (
                  <>
                    <EyeOff className="size-4" /> Blank the screen
                  </>
                ) : (
                  "Show again"
                )}
              </Button>
              <Button type="button" size="sm" variant={screen.mode === "full" ? "default" : "outline"} onClick={() => changeMode("full")}>
                Full screen
              </Button>
              <Button type="button" size="sm" variant={screen.mode === "lower_third" ? "default" : "outline"} onClick={() => changeMode("lower_third")}>
                Lower third
              </Button>
            </div>
          )}
          <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
            <p className="font-medium">Projector links</p>
            <LinkRow label="Screen in the hall" url={projectorUrl} copied={copied === "screen"} onCopy={() => copy("screen", projectorUrl)} />
            <LinkRow label="OBS browser source (over video)" url={obsUrl} copied={copied === "obs"} onCopy={() => copy("obs", obsUrl)} />
            <p className="text-muted-foreground">Anyone with a link can see what is on the screen. {canWrite && "If one is shared by mistake, reset the link in Settings."}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["bible", "Bible", BookOpen],
                ["library", "Songs & announcements", Music],
                ["settings", "Settings", Monitor],
              ] as const
            ).map(([key, label, Icon]) => (
              <Button key={key} type="button" size="sm" variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>
                <Icon className="size-4" /> {label}
              </Button>
            ))}
          </div>

          {tab === "bible" && <BiblePanel translations={translations} canWrite={canWrite} onProject={project} onQueue={(s) => saveQueue([...queue, ...s])} onError={setError} />}
          {tab === "library" && <LibraryPanel items={items} canWrite={canWrite} onProject={project} onQueue={(s) => saveQueue([...queue, ...s])} run={run} />}
          {tab === "settings" && (
            <SettingsPanel
              theme={screen.theme}
              translations={translations}
              canWrite={canWrite}
              onTheme={(theme) => {
                setScreen((s) => ({ ...s, theme }));
                run(() => setThemeAction(theme));
              }}
              run={run}
            />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">Order of service</p>
            {queue.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => saveQueue([])}>
                Clear
              </Button>
            )}
          </div>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add verses and slides here before the service, then tap them in turn. It is kept in this browser.</p>
          ) : (
            <ol className="grid gap-2 sm:grid-cols-2">
              {queue.map((slide, i) => (
                <li key={`${slide.title}-${i}`} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <button type="button" className="min-w-0 flex-1 text-left" disabled={!canWrite} onClick={() => project(slide)}>
                    <span className="block truncate font-medium">{slide.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{slide.text}</span>
                  </button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => saveQueue(queue.filter((_, j) => j !== i))}>
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinkRow({ label, url, copied, onCopy }: { label: string; url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-1">{url}</code>
        <Button type="button" size="icon-sm" variant="outline" aria-label={`Copy ${label}`} onClick={onCopy}>
          <Copy className="size-3.5" />
        </Button>
        <Button type="button" size="icon-sm" variant="outline" aria-label={`Open ${label}`} nativeButton={false} render={<a href={url} target="_blank" rel="noopener noreferrer" />}>
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
      {copied && <p className="text-primary">Copied.</p>}
    </div>
  );
}

function SlideButtons({ slides, active, canWrite, onProject, onQueue }: { slides: Slide[]; active: number; canWrite: boolean; onProject: (index: number) => void; onQueue: (slides: Slide[]) => void }) {
  return (
    <div className="space-y-2">
      {slides.map((slide, i) => (
        <div key={i} className={`flex items-start gap-2 rounded-lg border p-3 ${i === active ? "border-primary bg-primary/5" : "border-border"}`}>
          {slide.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slide.image} alt={slide.text} className="h-16 w-28 shrink-0 rounded border border-border object-cover" loading="lazy" />
          ) : null}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{slide.title}</p>
            <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">{slide.image ? `${slide.footer}${slide.text && !slide.text.startsWith("Slide ") ? ` · ${slide.text}` : ""}` : slide.text}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            {canWrite && (
              <Button type="button" size="sm" onClick={() => onProject(i)}>
                Show
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" aria-label="Add to order of service" onClick={() => onQueue([slide])}>
              <ListPlus className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BiblePanel({
  translations,
  canWrite,
  onProject,
  onQueue,
  onError,
}: {
  translations: ConsoleTranslation[];
  canWrite: boolean;
  onProject: (slide: Slide) => void;
  onQueue: (slides: Slide[]) => void;
  onError: (message: string | null) => void;
}) {
  // One or more translations. With several, each slide shows the same verses in all of them, the first being the main one.
  const [selected, setSelected] = useState<string[]>([translations[0]?.key ?? "kjv"]);
  const translation = selected[0] ?? "kjv";
  const [query, setQuery] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [hits, setHits] = useState<VerseHit[] | null>(null);
  const [active, setActive] = useState(-1);
  const [pending, start] = useTransition();

  const open = useCallback(
    (index: number) => {
      const slide = slides[index];
      if (!slide) return;
      setActive(index);
      onProject(slide);
    },
    [slides, onProject],
  );

  // Left and right arrows step through the passage's slides, so the operator needn't reach for the mouse.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight" && active < slides.length - 1) open(active + 1);
      if (event.key === "ArrowLeft" && active > 0) open(active - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, slides.length, open]);

  function find(text: string) {
    const value = text.trim();
    if (!value) return;
    onError(null);
    start(async () => {
      if (parseReference(value)) {
        const result = await lookupPassageAction(selected, value);
        if (result.error) return onError(result.error);
        setHits(null);
        setSlides(result.slides ?? []);
        setActive(-1);
      } else {
        const result = await searchVersesAction(translation, value);
        if (result.error) return onError(result.error);
        setSlides([]);
        setHits(result.hits ?? []);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          find(query);
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5" style={{ minWidth: "14rem" }}>
          <Label htmlFor="pj-query">Verse or words</Label>
          <Input id="pj-query" value={query} placeholder="John 3:16, Ps 23, or words like “shepherd”" onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm [&::-webkit-details-marker]:hidden">
            {selected.length === 1 ? (translations.find((t) => t.key === selected[0])?.name ?? "Translation") : `${selected.length} translations`}
            <ChevronDown className="size-4 opacity-60" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg">
            <p className="px-1 pb-1.5 text-xs text-muted-foreground">Tick up to {MAX_COMPARED} to show them together. The first ticked is the main one.</p>
            {translations.map((t) => {
              const on = selected.includes(t.key);
              return (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && selected.length >= MAX_COMPARED}
                    onChange={() => setSelected((cur) => (on ? (cur.length > 1 ? cur.filter((k) => k !== t.key) : cur) : [...cur, t.key]))}
                  />
                  <span>{t.name}</span>
                </label>
              );
            })}
          </div>
        </details>
        <Button type="submit" disabled={pending}>
          <Search className="size-4" /> {pending ? "Looking…" : "Find"}
        </Button>
      </form>

      {slides.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {slides.length} slide{slides.length === 1 ? "" : "s"}. Use the arrow keys to step through.
            </p>
            <div className="flex gap-1.5">
              <Button type="button" size="icon-sm" variant="outline" aria-label="Previous slide" disabled={!canWrite || active <= 0} onClick={() => open(active - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="outline" aria-label="Next slide" disabled={!canWrite || active >= slides.length - 1} onClick={() => open(active + 1)}>
                <ChevronRight className="size-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onQueue(slides)}>
                <ListPlus className="size-4" /> Add all
              </Button>
            </div>
          </div>
          <SlideButtons slides={slides} active={active} canWrite={canWrite} onProject={open} onQueue={onQueue} />
        </div>
      )}

      {hits && (
        <div className="space-y-2">
          {hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verse has all those words.</p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.reference}
                type="button"
                className="block w-full rounded-lg border border-border p-3 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  setQuery(hit.reference);
                  find(hit.reference);
                }}
              >
                <span className="font-medium">{hit.reference}</span>
                <span className="mt-0.5 block line-clamp-2 text-muted-foreground">{hit.text}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LibraryPanel({
  items,
  canWrite,
  onProject,
  onQueue,
  run,
}: {
  items: ConsoleItem[];
  canWrite: boolean;
  onProject: (slide: Slide) => void;
  onQueue: (slides: Slide[]) => void;
  run: (task: () => Promise<{ error?: string }>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; kind: "song" | "announcement" | "custom"; title: string; body: string } | null>(null);

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["song", "announcement", "custom"] as const).map((kind) => (
            <Button key={kind} type="button" size="sm" variant={editing.kind === kind ? "default" : "outline"} onClick={() => setEditing({ ...editing, kind })}>
              {kind === "song" ? "Song" : kind === "announcement" ? "Announcement" : "Other"}
            </Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pj-title">Title</Label>
          <Input id="pj-title" value={editing.title} maxLength={120} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pj-body">Text</Label>
          <Textarea id="pj-body" rows={10} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={"Leave a blank line between slides.\n\nFirst verse line one\nFirst verse line two\n\nChorus…"} />
          <p className="text-xs text-muted-foreground">Make sure the church has the right to use song words it types in.</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              const item = editing;
              setEditing(null);
              run(() => saveItemAction(item));
            }}
          >
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (importing) return <PresentationImporter onDone={() => setImporting(false)} />;

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setEditing({ kind: "song", title: "", body: "" })}>
            <Plus className="size-4" /> New song or announcement
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setImporting(true)}>
            <FileUp className="size-4" /> Add a PowerPoint
          </Button>
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet. Add the songs and announcements you project, then show them a slide at a time.</p>}
      {items.map((item) => {
        const slides = item.kind === "presentation" ? (item.imageSlides ?? []) : itemSlides(item.kind, item.title, item.body);
        return (
          <div key={item.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
                <span className="block truncate font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.kind === "song" ? "Song" : item.kind === "announcement" ? "Announcement" : item.kind === "presentation" ? "Presentation" : "Slide"} · {slides.length} slide{slides.length === 1 ? "" : "s"}
                </span>
              </button>
              <Button type="button" size="sm" variant="outline" aria-label="Add all slides to order of service" onClick={() => onQueue(slides)}>
                <ListPlus className="size-4" />
              </Button>
              {canWrite && (
                <>
                  {item.kind !== "presentation" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ id: item.id, kind: item.kind as "song" | "announcement" | "custom", title: item.title, body: item.body })}>
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Delete ${item.title}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${item.title}"?`)) run(() => deleteItemAction(item.id));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
            {openId === item.id && (
              <div className="border-t border-border p-3">
                <SlideButtons slides={slides} active={-1} canWrite={canWrite} onProject={(i) => onProject(slides[i])} onQueue={onQueue} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({
  theme,
  translations,
  canWrite,
  onTheme,
  run,
}: {
  theme: ProjectionTheme;
  translations: ConsoleTranslation[];
  canWrite: boolean;
  onTheme: (theme: ProjectionTheme) => void;
  run: (task: () => Promise<{ error?: string }>) => void;
}) {
  const t = withDefaults(theme);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function runImport() {
    setResult(null);
    start(async () => {
      const response = await importTranslationAction(name, text);
      if (response.error) setResult(`${response.error}${response.problems?.length ? ` ${response.problems.join("; ")}` : ""}`);
      else {
        setResult(`Added ${response.imported?.toLocaleString()} verses.${response.problems?.length ? ` Skipped: ${response.problems.join("; ")}` : ""}`);
        setName("");
        setText("");
        setImporting(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="font-medium">Look of the screen</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1.5 text-sm">
            <span className="block">Background</span>
            <input type="color" value={t.background} disabled={!canWrite} onChange={(e) => onTheme({ ...theme, background: e.target.value })} className="h-9 w-16 rounded border border-input" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block">Text</span>
            <input type="color" value={t.color} disabled={!canWrite} onChange={(e) => onTheme({ ...theme, color: e.target.value })} className="h-9 w-16 rounded border border-input" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block">Letters</span>
            <select value={t.font} disabled={!canWrite} onChange={(e) => onTheme({ ...theme, font: e.target.value === "serif" ? "serif" : "sans" })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="sans">Plain (sans-serif)</option>
              <option value="serif">Classic (serif)</option>
            </select>
          </label>
        </div>
        <BannerSetting theme={theme} canWrite={canWrite} onTheme={onTheme} />
      </div>

      <div className="space-y-3">
        <p className="font-medium">Bible translations</p>
        <ul className="space-y-1.5 text-sm">
          {translations.map((tr) => (
            <li key={tr.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span>
                {tr.name} <span className="text-xs text-muted-foreground">{tr.note}</span>
              </span>
              {tr.customId && canWrite && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Remove ${tr.name}`}
                  onClick={() => {
                    if (window.confirm(`Remove "${tr.name}" and all its verses?`)) run(() => deleteTranslationAction(tr.customId!));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canWrite && !importing && (
          <Button type="button" size="sm" variant="outline" onClick={() => setImporting(true)}>
            <Plus className="size-4" /> Add your own translation
          </Button>
        )}
        {importing && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="pj-tname">Name</Label>
              <Input id="pj-tname" value={name} maxLength={80} placeholder="e.g. Tamil Bible (old version)" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pj-ttext">Verses, one per line</Label>
              <Textarea id="pj-ttext" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"John 3:16 For God so loved the world…\nJohn 3:17 For God sent not his Son…"} />
              <p className="text-xs text-muted-foreground">Only add a translation the church has the right to use. You can add just the passages you need.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={runImport} disabled={pending}>
                {pending ? "Adding…" : "Add translation"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setImporting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {result && <p className="text-sm text-muted-foreground">{result}</p>}
      </div>

      {canWrite && (
        <div className="space-y-2">
          <p className="font-medium">Projector link</p>
          <p className="text-sm text-muted-foreground">If a link was shared with someone who shouldn&apos;t have it, make a new one. The old links stop working at once, so the screen and OBS need the new address.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm("Make a new projector link? The current one will stop working.")) run(async () => (await regenerateTokenAction()) ?? {});
            }}
          >
            Make a new link
          </Button>
        </div>
      )}
    </div>
  );
}

const BANNER_WIDTH = 1920;

// A picture for the lower-third bar (a church banner, a pattern). Shrunk in the browser, stored with the church's
// other projector pictures, and shown behind the words under a wash of the screen colour.
function BannerSetting({ theme, canWrite, onTheme }: { theme: ProjectionTheme; canWrite: boolean; onTheme: (theme: ProjectionTheme) => void }) {
  const t = withDefaults(theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shade, setShade] = useState(t.bannerShade);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, BANNER_WIDTH / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser can't prepare pictures.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) throw new Error("Couldn't prepare that picture.");
      const start = await startSlideUploadAction(1, blob.size);
      if (start.error || !start.slots) return setError(start.error ?? "Couldn't start the upload.");
      const storage = createBrowserClient().storage.from("projection-slides");
      const { error: uploadError } = await storage.uploadToSignedUrl(start.slots[0].path, start.slots[0].token, blob, { contentType: "image/jpeg" });
      if (uploadError) return setError(`The upload failed (${uploadError.message}). Check your connection and try again.`);
      onTheme({ ...theme, bannerImage: storage.getPublicUrl(start.slots[0].path).data.publicUrl, bannerShade: shade, bannerStyle: theme.bannerStyle ?? "below" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Lower-third banner picture <span className="font-normal text-muted-foreground">(optional)</span></p>
      <p className="text-xs text-muted-foreground">Your church&apos;s banner for the lower-third screen: a wide picture, such as the church name and logo. It can sit as a strip under the verse or behind it.</p>
      <div className="flex flex-wrap items-center gap-3">
        {t.bannerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.bannerImage} alt="Banner" className="h-12 w-32 rounded border border-border object-cover" />
        )}
        {canWrite && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <ImagePlus className="size-4" /> {busy ? "Uploading…" : t.bannerImage ? "Change picture" : "Add a picture"}
            <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
        {canWrite && t.bannerImage && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { const { bannerImage: _removed, ...rest } = theme; void _removed; onTheme(rest); }}>
            Remove
          </Button>
        )}
      </div>
      {t.bannerImage && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0">Placed</span>
            <select value={t.bannerStyle} disabled={!canWrite} onChange={(e) => onTheme({ ...theme, bannerStyle: e.target.value === "below" ? "below" : "behind" })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="below">As a strip under the verse (shown whole)</option>
              <option value="behind">Behind the verse words</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!t.bannerAlways} disabled={!canWrite} onChange={(e) => onTheme({ ...theme, bannerAlways: e.target.checked })} />
            Keep the banner on screen between verses
          </label>
        </div>
      )}
      {t.bannerImage && t.bannerStyle === "behind" && (
        <label className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0">Darken for reading</span>
          <input
            type="range"
            min={0}
            max={100}
            value={shade}
            disabled={!canWrite}
            onChange={(e) => setShade(Number(e.target.value))}
            onPointerUp={() => onTheme({ ...theme, bannerShade: shade })}
            onKeyUp={() => onTheme({ ...theme, bannerShade: shade })}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs text-muted-foreground">{shade}%</span>
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
