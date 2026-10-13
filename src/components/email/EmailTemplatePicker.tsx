"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, LayoutTemplate, Trash2 } from "lucide-react";
import { deleteEmailTemplateAction, saveEmailTemplateAction } from "@/lib/email/template-actions";
import { BUILT_IN_EMAIL_TEMPLATES, fillChurchName } from "@/lib/email/templates";
import type { EmailTemplate } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS = "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs";

// Start an email from a ready-made or saved template, and save the one being written as a template.
export function EmailTemplatePicker({
  templates,
  churchName,
  canSave,
  hasContent,
  current,
  onApply,
  disabled,
}: {
  templates: EmailTemplate[];
  churchName: string;
  canSave: boolean;
  hasContent: boolean;
  current: () => { subject: string; html: string };
  onApply: (subject: string, html: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function apply(value: string) {
    setSelected("");
    if (!value) return;
    if (hasContent && !window.confirm("Replace what you have written with this template?")) return;
    if (value.startsWith("built:")) {
      const t = BUILT_IN_EMAIL_TEMPLATES.find((x) => x.key === value.slice(6));
      if (t) onApply(fillChurchName(t.subject, churchName), fillChurchName(t.html, churchName));
    } else {
      const t = templates.find((x) => x.id === value.slice(5));
      if (t) onApply(t.subject, t.body_html);
    }
  }

  function save() {
    setError(null);
    const { subject, html } = current();
    startTransition(async () => {
      const result = await saveEmailTemplateAction({ name, subject, html });
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setName("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this template?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEmailTemplateAction(id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <ErrorToast message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <LayoutTemplate className="size-4 text-muted-foreground" />
        <select className={SELECT_CLASS} value={selected} disabled={disabled} onChange={(e) => apply(e.target.value)} aria-label="Start from a template">
          <option value="">Start from a template…</option>
          <optgroup label="Ready-made">
            {BUILT_IN_EMAIL_TEMPLATES.map((t) => (
              <option key={t.key} value={`built:${t.key}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {templates.length > 0 && (
            <optgroup label="Your templates">
              {templates.map((t) => (
                <option key={t.id} value={`mine:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {canSave && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button type="button" variant="outline" size="sm" disabled={disabled} />}>
              <BookmarkPlus className="size-3.5" />
              Save as template
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save as a template</DialogTitle>
                <DialogDescription>Saves the subject and message you have written, so you can start from it next time. A template with the same name is replaced.</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Template name</Label>
                <Input id="template-name" value={name} maxLength={80} placeholder="Monthly newsletter" onChange={(e) => setName(e.target.value)} />
              </div>
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Your saved templates</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {templates.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                        <button type="button" className="min-w-0 truncate text-left hover:underline" title="Use this name to replace it" onClick={() => setName(t.name)}>
                          {t.name}
                        </button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} disabled={pending} onClick={() => remove(t.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button type="button" disabled={pending || !name.trim()} onClick={save}>
                  {pending ? "Saving…" : "Save template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Pick a ready-made template or one of your own, then edit it. Anything in [square brackets] is a blank for you to fill in.</p>
    </div>
  );
}
