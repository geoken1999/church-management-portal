"use client";

import { useMemo, useState, useTransition } from "react";
import { BarChart3, Check, Copy, Download, ExternalLink, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { createQrCode, deleteQrCode, loadQrStats, updateQrCode, type QrFormState } from "@/lib/qr/actions";
import { DEFAULT_QR_DESIGN, DOT_STYLES, EYE_STYLES, contrastRatio, normalizeDesign, renderQrSvg, type QrDesign } from "@/lib/qr/design";
import { downloadBlob, fetchAsDataUrl, fileSafe, svgToPngBlob } from "@/lib/qr/export";
import type { QrStats } from "@/lib/qr/dal";
import type { QrCodeRow } from "@/types/database";
import { useQrLogo } from "@/components/organizations/QrLogoContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

const DOT_LABELS = { square: "Square", rounded: "Rounded", dots: "Dots" } as const;
const EYE_LABELS = { square: "Square", rounded: "Rounded", circle: "Round" } as const;

const PRESETS: { name: string; design: Partial<QrDesign> }[] = [
  { name: "Classic", design: { fg: "#111827", fg2: null, bg: "#ffffff", dots: "square", eyes: "square", eyeColor: null } },
  { name: "Ocean", design: { fg: "#0f4c81", fg2: "#0891b2", bg: "#ffffff", dots: "rounded", eyes: "rounded", eyeColor: "#0f4c81" } },
  { name: "Royal", design: { fg: "#4c1d95", fg2: "#be185d", bg: "#ffffff", dots: "dots", eyes: "circle", eyeColor: "#4c1d95" } },
  { name: "Forest", design: { fg: "#14532d", fg2: null, bg: "#f0fdf4", dots: "rounded", eyes: "rounded", eyeColor: null } },
];

function QrPreview({ value, design, className, logoUrl, logoSizePercent }: { value: string; design: QrDesign; className?: string; logoUrl: string | null; logoSizePercent: number }) {
  const svg = useMemo(() => renderQrSvg(value, design, { size: 512, logoDataUrl: logoUrl, logoSizePercent }), [value, design, logoUrl, logoSizePercent]);
  return (
    <div
      className={className}
      style={design.transparent ? { backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%)", backgroundSize: "16px 16px" } : undefined}
      // The markup comes from renderQrSvg: colours are validated hex, the label is escaped, nothing else is free text.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// The centre logo for a code: the church's QR logo if one was uploaded, otherwise its main logo.
function useCodeLogo() {
  const { url, sizePercent, fallbackUrl } = useQrLogo();
  return { url: url ?? fallbackUrl ?? null, sizePercent };
}

function shortLink(siteUrl: string, code: string) {
  return `${siteUrl}/q/${code}`;
}

export function QrCodeManager({ codes, siteUrl, canWrite, canDelete }: { codes: QrCodeRow[]; siteUrl: string; canWrite: boolean; canDelete: boolean }) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <QrEditor siteUrl={siteUrl} />
        </div>
      )}
      {codes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <QrCode className="size-8 text-muted-foreground" />
            <p className="font-medium">No QR codes yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Make one for your giving page, an event, a welcome form or your app, and print it. You can change where it goes later without reprinting.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {codes.map((code) => (
            <QrCard key={code.id} code={code} siteUrl={siteUrl} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function QrCard({ code, siteUrl, canWrite, canDelete }: { code: QrCodeRow; siteUrl: string; canWrite: boolean; canDelete: boolean }) {
  const logo = useCodeLogo();
  const design = useMemo(() => normalizeDesign(code.design), [code.design]);
  const link = shortLink(siteUrl, code.code);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const ended = Boolean(code.expires_at && new Date(code.expires_at) < new Date());

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the link is shown on the card to copy by hand.
    }
  }

  async function download(kind: "png" | "svg") {
    setBusy(true);
    try {
      const logoDataUrl = design.logo && logo.url ? await fetchAsDataUrl(logo.url) : null;
      const svg = renderQrSvg(link, design, { size: 1024, logoDataUrl, logoSizePercent: logo.sizePercent });
      const blob = kind === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : await svgToPngBlob(svg, 1600);
      downloadBlob(blob, `${fileSafe(code.name)}.${kind}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <QrPreview value={link} design={design} logoUrl={design.logo ? logo.url : null} logoSizePercent={logo.sizePercent} className="size-28 shrink-0 overflow-hidden rounded-md border [&>svg]:h-full [&>svg]:w-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate font-heading text-base font-bold">{code.name}</h3>
            <button type="button" onClick={copy} className="flex max-w-full items-center gap-1 truncate text-left text-sm text-primary hover:underline" title="Copy the short link">
              {copied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0" />}
              <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
            </button>
            <p className="truncate text-xs text-muted-foreground" title={code.destination_url}>
              → {code.destination_url.replace(/^https?:\/\//, "")}
            </p>
            <div className="flex flex-wrap gap-1">
              {code.status === "paused" && <Badge variant="outline">Paused</Badge>}
              {ended && <Badge variant="outline">Ended</Badge>}
              {code.ios_url && <Badge variant="secondary">iPhone</Badge>}
              {code.android_url && <Badge variant="secondary">Android</Badge>}
              {code.desktop_url && <Badge variant="secondary">Computer</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{code.scan_count}</span> {code.scan_count === 1 ? "visit" : "visits"}
            </p>
            <p className="text-xs text-muted-foreground">
              iPhone <span className="font-semibold text-foreground">{code.ios_scans}</span> · Android <span className="font-semibold text-foreground">{code.android_scans}</span> · Computer{" "}
              <span className="font-semibold text-foreground">{code.desktop_scans}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => download("png")}>
            <Download className="size-3.5" />
            PNG
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => download("svg")}>
            <Download className="size-3.5" />
            SVG
          </Button>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground" title="Test the link">
            <ExternalLink className="size-3.5" />
          </a>
          <div className="ml-auto flex items-center gap-1">
            <QrStatsDialog code={code} />
            {canWrite && <QrEditor siteUrl={siteUrl} code={code} />}
            {canDelete && <DeleteQr code={code} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteQr({ code }: { code: QrCodeRow }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Delete QR code" />}>
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this QR code?</DialogTitle>
          <DialogDescription>
            &ldquo;{code.name}&rdquo; and its scan history will be removed. Any printed copy will stop working and send people to the KingdomFlow home page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <form action={deleteQrCode}>
            <input type="hidden" name="id" value={code.id} />
            <Button type="submit" variant="destructive" onClick={() => setTimeout(() => setOpen(false), 0)}>
              Delete
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrStatsDialog({ code }: { code: QrCodeRow }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<QrStats | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    loadQrStats(code.id).then((result) => {
      setStats(result);
      setLoading(false);
    });
  }

  const peak = Math.max(1, ...(stats?.perDay.map((d) => d.count) ?? [1]));
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Scan statistics" />}>
        <BarChart3 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{code.name}: visits</DialogTitle>
          <DialogDescription>
            {code.scan_count} in total{code.last_scanned_at ? `, last on ${new Date(code.last_scanned_at).toLocaleString()}` : ""}. Link previews and robots are not counted.
          </DialogDescription>
        </DialogHeader>
        {loading || !stats ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Last 14 days</p>
              <div className="flex h-24 items-end gap-1">
                {stats.perDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.count}`}>
                    <div className="w-full rounded-sm bg-primary/80" style={{ height: `${Math.max(2, (d.count / peak) * 100)}%` }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["iPhone", code.ios_scans],
                  ["Android", code.android_scans],
                  ["Computer", code.desktop_scans],
                ] as const
              ).map(([label, count]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {stats.topCountries.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Top countries</p>
                <ul className="text-sm text-muted-foreground">
                  {stats.topCountries.map((c) => (
                    <li key={c.country} className="flex justify-between">
                      <span>{c.country}</span>
                      <span>{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ColorField({ label, value, onChange, onClear }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5" aria-label={label} />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
        {onClear && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={onClear}>
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function Choice<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        {options.map((o) => (
          <Button key={o} type="button" size="sm" variant={value === o ? "default" : "outline"} onClick={() => onChange(o)}>
            {labels[o]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function QrEditor({ siteUrl, code }: { siteUrl: string; code?: QrCodeRow }) {
  const logo = useCodeLogo();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [destination, setDestination] = useState("");
  const [ios, setIos] = useState("");
  const [android, setAndroid] = useState("");
  const [desktop, setDesktop] = useState("");
  const [expires, setExpires] = useState("");
  const [expiredUrl, setExpiredUrl] = useState("");
  const [paused, setPaused] = useState(false);
  const [design, setDesign] = useState<QrDesign>(DEFAULT_QR_DESIGN);

  function reset() {
    setError(null);
    setName(code?.name ?? "");
    setShortCode(code?.code ?? "");
    setDestination(code?.destination_url ?? "");
    setIos(code?.ios_url ?? "");
    setAndroid(code?.android_url ?? "");
    setDesktop(code?.desktop_url ?? "");
    setExpires(toLocalInput(code?.expires_at ?? null));
    setExpiredUrl(code?.expired_url ?? "");
    setPaused(code?.status === "paused");
    setDesign(normalizeDesign(code?.design));
  }

  const patch = (change: Partial<QrDesign>) => setDesign((d) => ({ ...d, ...change }));
  const previewLink = shortLink(siteUrl, shortCode.trim().toLowerCase() || code?.code || "your-link");
  const lowContrast = !design.transparent && contrastRatio(design.fg, design.bg) < 3;
  const inverted = !design.transparent && contrastRatio(design.fg, "#ffffff") < contrastRatio(design.bg, "#ffffff");

  function submit() {
    const formData = new FormData();
    if (code) formData.set("id", code.id);
    formData.set("name", name);
    formData.set("code", shortCode);
    formData.set("destination_url", destination);
    formData.set("ios_url", ios);
    formData.set("android_url", android);
    formData.set("desktop_url", desktop);
    formData.set("expires_at", expires ? new Date(expires).toISOString() : "");
    formData.set("expired_url", expiredUrl);
    formData.set("status", paused ? "paused" : "active");
    formData.set("design", JSON.stringify(design));
    setError(null);
    startTransition(async () => {
      const result: QrFormState = await (code ? updateQrCode : createQrCode)({}, formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      {code ? (
        <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit QR code" />}>
          <Pencil className="size-3.5" />
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={
            <Button type="button">
              <Plus className="size-4" />
              New QR code
            </Button>
          }
        />
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{code ? "Edit QR code" : "New QR code"}</DialogTitle>
          <DialogDescription>The code points at a short link. Change the destinations any time and printed copies follow.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <Tabs defaultValue="link">
            <TabsList>
              <TabsTab value="link">Link</TabsTab>
              <TabsTab value="platforms">Platforms</TabsTab>
              <TabsTab value="look">Look</TabsTab>
              <TabsTab value="settings">Settings</TabsTab>
              <TabsIndicator />
            </TabsList>

            <div className="space-y-4">
              <TabPanel id="link">
                <Field label="Name" hint="Only you see this.">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday giving" maxLength={80} />
                </Field>
                <Field label="Where should it go?" hint="The web address people land on.">
                  <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="https://www.kingdomflow.in/give/your-church" inputMode="url" />
                </Field>
                <Field label="Short link" hint={code ? "The short link can't be changed once made, because it's already in the code." : "Leave empty for a random one, or choose your own, e.g. give."}>
                  <div className="flex items-center gap-1">
                    <span className="shrink-0 text-sm text-muted-foreground">{siteUrl.replace(/^https?:\/\//, "")}/q/</span>
                    <Input value={shortCode} onChange={(e) => setShortCode(e.target.value.toLowerCase())} placeholder="give" disabled={Boolean(code)} maxLength={40} />
                  </div>
                </Field>
              </TabPanel>

              <TabPanel id="platforms">
                <p className="text-sm text-muted-foreground">Send people to a different place depending on their phone. Anything left empty uses the main link.</p>
                <Field label="iPhone and iPad" hint="e.g. your App Store page">
                  <Input value={ios} onChange={(e) => setIos(e.target.value)} placeholder="https://apps.apple.com/…" inputMode="url" />
                </Field>
                <Field label="Android" hint="e.g. your Google Play page">
                  <Input value={android} onChange={(e) => setAndroid(e.target.value)} placeholder="https://play.google.com/…" inputMode="url" />
                </Field>
                <Field label="Computer" hint="Laptops and desktops">
                  <Input value={desktop} onChange={(e) => setDesktop(e.target.value)} placeholder="https://…" inputMode="url" />
                </Field>
              </TabPanel>

              <TabPanel id="look">
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <Button key={p.name} type="button" size="sm" variant="outline" onClick={() => patch(p.design)}>
                      {p.name}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="Dots" value={design.fg} onChange={(v) => patch({ fg: v })} />
                  <ColorField label="Background" value={design.bg} onChange={(v) => patch({ bg: v })} />
                  <ColorField label="Gradient to" value={design.fg2 ?? design.fg} onChange={(v) => patch({ fg2: v })} onClear={design.fg2 ? () => patch({ fg2: null }) : undefined} />
                  <ColorField label="Corner squares" value={design.eyeColor ?? design.fg} onChange={(v) => patch({ eyeColor: v })} onClear={design.eyeColor ? () => patch({ eyeColor: null }) : undefined} />
                </div>
                {(lowContrast || inverted) && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {inverted ? "The dots are lighter than the background, and many phones can't scan that." : "The dots and background are too close in colour, so the code may not scan. Make them more different."}
                  </p>
                )}
                <Choice label="Dots" value={design.dots} options={DOT_STYLES} labels={DOT_LABELS} onChange={(v) => patch({ dots: v })} />
                <Choice label="Corners" value={design.eyes} options={EYE_STYLES} labels={EYE_LABELS} onChange={(v) => patch({ eyes: v })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={design.transparent} onChange={(e) => patch({ transparent: e.target.checked })} />
                  Transparent background (PNG and SVG)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={design.logo} disabled={!logo.url} onChange={(e) => patch({ logo: e.target.checked })} />
                  Church logo in the middle{!logo.url && " (upload a logo in Profile first)"}
                </label>
                <Field label="Text under the code" hint="e.g. Scan to give. Leave empty for none.">
                  <Input value={design.label} onChange={(e) => patch({ label: e.target.value })} maxLength={30} placeholder="Scan me" />
                </Field>
                {design.label.trim() && (
                  <div className="grid grid-cols-2 gap-3">
                    <ColorField label="Text bar" value={design.labelBar} onChange={(v) => patch({ labelBar: v })} />
                    <ColorField label="Text colour" value={design.labelText} onChange={(v) => patch({ labelText: v })} />
                  </div>
                )}
              </TabPanel>

              <TabPanel id="settings">
                <Field label="Stop working on" hint="Optional. After this, scans go to the link below (or the KingdomFlow home page).">
                  <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </Field>
                <Field label="Send people here after it ends" hint="Optional">
                  <Input value={expiredUrl} onChange={(e) => setExpiredUrl(e.target.value)} placeholder="https://…" inputMode="url" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
                  Pause this QR code (scans go to the &ldquo;after it ends&rdquo; link)
                </label>
              </TabPanel>
            </div>
          </Tabs>

          <div className="space-y-2 md:sticky md:top-0 md:self-start">
            <QrPreview value={previewLink} design={design} logoUrl={design.logo ? logo.url : null} logoSizePercent={logo.sizePercent} className="mx-auto w-full max-w-[260px] overflow-hidden rounded-lg border [&>svg]:h-auto [&>svg]:w-full" />
            <p className="break-all text-center text-xs text-muted-foreground">{previewLink}</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Saving…" : code ? "Save changes" : "Create QR code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// keepMounted so nothing typed is lost when switching tabs.
function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <TabsPanel value={id} keepMounted>
      <div className="space-y-4 pt-2">{children}</div>
    </TabsPanel>
  );
}
