"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, EyeOff, Trash2 } from "lucide-react";
import { deleteTemplate, importTemplate, installStarterLibrary, setTemplatesPublished, updateTemplate } from "@/lib/designer/template-actions";
import type { DesignCategoryRow, DesignTemplateRow } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = Omit<DesignTemplateRow, "doc">;

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

export function TemplateAdmin({ categories, templates }: { categories: DesignCategoryRow[]; templates: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", categoryId: "", tags: "", isPremium: false, published: true, featuredRank: 0 });
  const [imp, setImp] = useState({ title: "", categoryId: categories[0]?.id ?? "", tags: "", isPremium: false, published: false, json: "" });
  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const shown = templates.filter((t) => (!category || t.category_id === category) && (!q || t.title.toLowerCase().includes(q.toLowerCase()) || t.tags.some((tag) => tag.includes(q.toLowerCase()))));

  function run(action: () => Promise<{ error?: string; message?: string }>, after?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        if (result.message) setNotice(result.message);
        after?.();
      }
      router.refresh();
    });
  }

  function edit(t: Row) {
    setEditing(t.id);
    setDraft({ title: t.title, categoryId: t.category_id, tags: t.tags.join(", "), isPremium: t.is_premium, published: t.published, featuredRank: t.featured_rank });
  }

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {notice && <p className="rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{notice}</p>}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[240px] flex-1 text-sm">
            <p className="font-medium">Starter library</p>
            <p className="text-muted-foreground">
              Adds the generated categories and templates. Templates already installed are left as they are, so edits aren&apos;t lost. {templates.length} templates installed.
            </p>
          </div>
          <Button disabled={pending} onClick={() => run(installStarterLibrary)}>
            {pending ? "Working…" : templates.length === 0 ? "Install starter library" : "Add missing starter templates"}
          </Button>
        </CardContent>
      </Card>

      {categories.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">Add a template from JSON</p>
            <p className="text-xs text-muted-foreground">Paste a design document (width, height, background and elements). It is checked and cleaned the same way a saved design is.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="imp-title">Title</Label>
                <Input id="imp-title" value={imp.title} onChange={(e) => setImp({ ...imp, title: e.target.value })} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-cat">Category</Label>
                <select id="imp-cat" className={`${selectClass} w-full`} value={imp.categoryId} onChange={(e) => setImp({ ...imp, categoryId: e.target.value })}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.group_name} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="imp-tags">Tags (comma separated)</Label>
                <Input id="imp-tags" value={imp.tags} onChange={(e) => setImp({ ...imp, tags: e.target.value })} />
              </div>
            </div>
            <Textarea value={imp.json} onChange={(e) => setImp({ ...imp, json: e.target.value })} rows={5} className="font-mono text-xs" aria-label="Design JSON" placeholder='{"width":1080,"height":1080,"background":{"type":"solid","color":"#ffffff"},"elements":[]}' />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={imp.isPremium} onChange={(e) => setImp({ ...imp, isPremium: e.target.checked })} /> Premium
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={imp.published} onChange={(e) => setImp({ ...imp, published: e.target.checked })} /> Publish now
              </label>
              <Button disabled={pending || !imp.title.trim() || !imp.json.trim()} onClick={() => run(() => importTemplate(imp), () => setImp({ ...imp, title: "", json: "" }))}>
                Add template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className="w-64" aria-label="Search templates" />
        <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{shown.length} shown</span>
        {shown.length > 0 && (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setTemplatesPublished(shown.map((t) => t.id), true))}>
              <Eye className="size-4" /> Publish shown
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setTemplatesPublished(shown.map((t) => t.id), false))}>
              <EyeOff className="size-4" /> Unpublish shown
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Title</th>
              <th className="p-2">Category</th>
              <th className="p-2">Size</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Used</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 200).map((t) => (
              <tr key={t.id} className="border-t align-top">
                {editing === t.id ? (
                  <td colSpan={6} className="space-y-2 p-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" maxLength={120} />
                      <select className={selectClass} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} aria-label="Category">
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Input type="number" min={0} max={1000} value={draft.featuredRank} onChange={(e) => setDraft({ ...draft, featuredRank: Number(e.target.value) })} aria-label="Featured rank" title="Higher shows first under Recommended" />
                    </div>
                    <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} aria-label="Tags" placeholder="Tags, comma separated" />
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={draft.isPremium} onChange={(e) => setDraft({ ...draft, isPremium: e.target.checked })} /> Premium
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} /> Published
                      </label>
                      <Button size="sm" disabled={pending} onClick={() => run(() => updateTemplate({ id: t.id, ...draft }), () => setEditing(null))}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="p-2">
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.tags.join(", ")}</p>
                    </td>
                    <td className="p-2">{names.get(t.category_id)}</td>
                    <td className="p-2 whitespace-nowrap">{t.width} × {t.height}</td>
                    <td className="space-x-1 p-2 whitespace-nowrap">
                      <Badge variant={t.published ? "secondary" : "outline"}>{t.published ? "Published" : "Hidden"}</Badge>
                      {t.is_premium && <Badge>Premium</Badge>}
                    </td>
                    <td className="p-2 text-right">{t.popularity}</td>
                    <td className="space-x-1 p-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => edit(t)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTemplatesPublished([t.id], !t.published))} aria-label={t.published ? "Unpublish" : "Publish"}>
                        {t.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Delete “${t.title}”? Designs already made from it are not affected.`)) run(() => deleteTemplate(t.id));
                        }}
                        aria-label="Delete template"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {templates.length === 0 ? "No templates yet. Install the starter library above." : "No templates match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {shown.length > 200 && <p className="text-xs text-muted-foreground">Showing the first 200. Narrow the search to see the rest.</p>}
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Download className="size-3" /> To reuse a design as a template, copy its document JSON from the design&apos;s row in the database and paste it above.
      </p>
    </div>
  );
}
