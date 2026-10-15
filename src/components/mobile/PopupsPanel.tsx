"use client";

import { useState, useTransition } from "react";
import { deletePopupAction, savePopupAction, setPopupActiveAction } from "@/lib/mobile/popup-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";
import type { AppPopup } from "@/types/database";

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusOf(p: AppPopup): { label: string; live: boolean } {
  const now = Date.now();
  if (!p.is_active) return { label: "Paused", live: false };
  if (new Date(p.starts_at).getTime() > now) return { label: "Scheduled", live: false };
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) return { label: "Ended", live: false };
  return { label: "Live", live: true };
}

const EMPTY = { title: "", message: "", buttonLabel: "", linkUrl: "", startsAt: "", endsAt: "", showEveryTime: false };

export function PopupsPanel({ popups }: { popups: AppPopup[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startNew() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function startEdit(p: AppPopup) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      message: p.message,
      buttonLabel: p.button_label ?? "",
      linkUrl: p.link_url ?? "",
      startsAt: toLocalInput(p.starts_at),
      endsAt: toLocalInput(p.ends_at),
      showEveryTime: p.show_every_time,
    });
    setOpen(true);
  }

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else after?.();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        savePopupAction(editingId, {
          ...form,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : "",
        }),
      () => setOpen(false),
    );
  }

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {!open && <Button onClick={startNew}>New popup</Button>}

      {open && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent>
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="popup-title">Title</Label>
                  <Input id="popup-title" value={form.title} onChange={set("title")} maxLength={80} placeholder="Easter service this Sunday" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="popup-message">Message (optional)</Label>
                  <Textarea id="popup-message" value={form.message} onChange={set("message")} maxLength={600} rows={4} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="popup-button">Button label (optional)</Label>
                    <Input id="popup-button" value={form.buttonLabel} onChange={set("buttonLabel")} maxLength={30} placeholder="Register now" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="popup-link">Button link</Label>
                    <Input id="popup-link" value={form.linkUrl} onChange={set("linkUrl")} placeholder="https://" inputMode="url" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="popup-start">Show from (blank = now)</Label>
                    <Input id="popup-start" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="popup-end">Show until (blank = until you pause it)</Label>
                    <Input id="popup-end" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.showEveryTime} onChange={(e) => setForm((f) => ({ ...f, showEveryTime: e.target.checked }))} />
                  Show every time the app opens (otherwise a member sees it once)
                </label>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving..." : editingId ? "Save changes" : "Publish popup"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="font-heading text-lg font-semibold">{form.title || "Popup title"}</h3>
              {form.message && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{form.message}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <span className="rounded-md px-3 py-1.5 text-sm text-muted-foreground">Close</span>
                {form.buttonLabel && <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{form.buttonLabel}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {popups.length === 0 && <p className="text-sm text-muted-foreground">No popups yet.</p>}
        {popups.map((p) => {
          const status = statusOf(p);
          return (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant={status.live ? "default" : "secondary"}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(p.starts_at).toLocaleString()}
                    {p.ends_at ? ` – ${new Date(p.ends_at).toLocaleString()}` : " – no end"} · {p.show_every_time ? "every app open" : "once per member"}
                    {p.button_label ? ` · button: ${p.button_label}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPopupActiveAction(p.id, !p.is_active))}>
                    {p.is_active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete "${p.title}"?`)) run(() => deletePopupAction(p.id));
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
