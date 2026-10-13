"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileBarChart, Eye, Trash2, Smartphone, Sparkles, LayoutTemplate } from "lucide-react";
import { deleteMonthlyReportAction, deleteReportTemplateAction, generateMonthlyReportAction, saveReportTemplateAction, setMonthlyReportPublishedAction } from "@/lib/reports/monthly-actions";
import {
  BUILT_IN_TEMPLATES,
  MONTHLY_SECTIONS,
  REPORT_LANGUAGES,
  REPORT_TONES,
  type Letterhead,
  type ReportKind,
  type ReportLanguage,
  type ReportTemplateConfig,
  type ReportTone,
} from "@/lib/reports/monthly";
import type { SavedMonthlyReport, SavedReportTemplate } from "@/lib/reports/monthly-dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function MonthlyReportsPanel({
  reports,
  templates,
  branches,
  allowedSections,
  canWrite,
  canDelete,
  canPublish,
  latestFinishedMonth,
  latestFinishedYear,
  defaultLetterhead,
  canUseAi,
}: {
  reports: SavedMonthlyReport[];
  templates: SavedReportTemplate[];
  branches: { id: string; name: string }[];
  allowedSections: string[];
  canWrite: boolean;
  canDelete: boolean;
  canPublish: boolean;
  latestFinishedMonth: string;
  latestFinishedYear: string;
  defaultLetterhead: Letterhead;
  canUseAi: boolean;
}) {
  const [kind, setKind] = useState<ReportKind>("monthly");
  const [month, setMonth] = useState(latestFinishedMonth);
  const [year, setYear] = useState(latestFinishedYear);
  const [branchId, setBranchId] = useState("");
  const [language, setLanguage] = useState<ReportLanguage>("en");
  const [sections, setSections] = useState<string[]>(allowedSections);
  const [ai, setAi] = useState(canUseAi);
  const [tone, setTone] = useState<ReportTone>("warm");
  const [note, setNote] = useState("");
  const [letterhead, setLetterhead] = useState<Letterhead>(defaultLetterhead);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success" | "warning"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function applyTemplate(id: string) {
    setTemplateId(id);
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
    const saved = templates.find((t) => t.id === id);
    const config: Partial<ReportTemplateConfig> | null = builtIn ? builtIn.config : saved ? saved.config : null;
    if (!config) return;
    if (config.sections) setSections(config.sections.filter((s) => allowedSections.includes(s)));
    if (config.language) setLanguage(config.language);
    if (config.ai !== undefined) setAi(config.ai && canUseAi);
    if (config.tone) setTone(config.tone);
    if (config.note !== undefined) setNote(config.note);
    if (config.letterhead) setLetterhead({ ...defaultLetterhead, ...config.letterhead });
  }

  function toggle(key: string) {
    setSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const setHead = (key: keyof Letterhead, value: string) => setLetterhead((prev) => ({ ...prev, [key]: value }));

  function generate() {
    setMessage(null);
    startTransition(async () => {
      const result = await generateMonthlyReportAction({ kind, period: kind === "annual" ? year : month, branchId: branchId || null, language, sections, note, ai, tone, letterhead });
      if (result.error) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: result.warning ? "warning" : "success", text: result.warning ?? "The report is ready below." });
    });
  }

  function saveTemplate() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveReportTemplateAction(templateName, { sections: sections as ReportTemplateConfig["sections"], language, ai, tone, note, letterhead });
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: `Template "${templateName}" saved.` });
      if (!result.error) setTemplateName("");
    });
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="size-4 text-primary" />
              Make a report
            </CardTitle>
            <CardDescription>
              A monthly or annual summary of the whole church or one branch, from your own records, in English, Tamil or Hindi. Totals only: it never shows who gave what. Making a report for a
              period that already has one replaces it (its photos stay).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {message && (
              <Alert variant={message.kind === "error" ? "destructive" : "default"}>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="template" className="flex items-center gap-1.5">
                <LayoutTemplate className="size-3.5" />
                Start from a template (optional)
              </Label>
              <div className="flex flex-wrap gap-2">
                <select id="template" className={`${SELECT_CLASS} max-w-sm`} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">No template</option>
                  <optgroup label="Ready-made">
                    {BUILT_IN_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.description}
                      </option>
                    ))}
                  </optgroup>
                  {templates.length > 0 && (
                    <optgroup label="Your templates">
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {templates.some((t) => t.id === templateId) && canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm("Delete this template?")) startTransition(async () => void (await deleteReportTemplateAction(templateId)).error);
                      setTemplateId("");
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete template
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="kind">Report</Label>
                <select id="kind" className={SELECT_CLASS} value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (whole year)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                {kind === "annual" ? (
                  <>
                    <Label htmlFor="year">Year</Label>
                    <Input id="year" type="number" min={2000} max={Number(latestFinishedYear)} value={year} onChange={(e) => setYear(e.target.value)} />
                  </>
                ) : (
                  <>
                    <Label htmlFor="month">Month</Label>
                    <Input id="month" type="month" value={month} max={latestFinishedMonth} onChange={(e) => setMonth(e.target.value)} />
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch">For</Label>
                <select id="branch" className={SELECT_CLASS} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">The whole church</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} branch
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="language">Language</Label>
                <select id="language" className={SELECT_CLASS} value={language} onChange={(e) => setLanguage(e.target.value as ReportLanguage)}>
                  {REPORT_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {branchId && <p className="-mt-2 text-xs text-muted-foreground">Donations aren&apos;t recorded per branch, so a branch report counts offerings only.</p>}

            <div className="space-y-1.5">
              <Label>What to include</Label>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {MONTHLY_SECTIONS.filter((s) => allowedSections.includes(s.key)).map((s) => (
                  <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={sections.includes(s.key)} onCheckedChange={() => toggle(s.key)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={ai && canUseAi} disabled={!canUseAi} onCheckedChange={() => setAi((v) => !v)} />
                <Sparkles className="size-4 text-primary" />
                Write the summary with AI
              </label>
              <p className="text-xs text-muted-foreground">
                {canUseAi ? "AI writes a short summary at the top, using only the figures in the report, in the language you chose. It uses 1 AI credit." : "AI isn't set up for this account."}
              </p>
              {ai && canUseAi && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {REPORT_TONES.map((t) => (
                    <Button key={t.value} type="button" size="sm" variant={tone === t.value ? "default" : "outline"} onClick={() => setTone(t.value)} title={t.hint}>
                      {t.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Church details at the top of the report</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={letterhead.churchName} onChange={(e) => setHead("churchName", e.target.value)} placeholder="Church name" maxLength={120} />
                <Input value={letterhead.phone} onChange={(e) => setHead("phone", e.target.value)} placeholder="Phone" maxLength={40} />
                <Input value={letterhead.email} onChange={(e) => setHead("email", e.target.value)} placeholder="Email" maxLength={120} />
                <Input value={letterhead.website} onChange={(e) => setHead("website", e.target.value)} placeholder="Website" maxLength={120} />
              </div>
              <Input value={letterhead.address} onChange={(e) => setHead("address", e.target.value)} placeholder="Address" maxLength={300} />
              <p className="text-xs text-muted-foreground">Your church&apos;s logo is shown beside these automatically.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">A note from you (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} rows={3} placeholder="A word of thanks, praise reports, what's coming next..." />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={generate} disabled={pending || sections.length === 0 || !(kind === "annual" ? year : month)}>
                {pending ? "Working..." : "Make report"}
              </Button>
              <div className="flex items-center gap-2">
                <Input className="h-8 w-44" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Save these settings as..." maxLength={60} />
                <Button type="button" variant="outline" size="sm" disabled={pending || templateName.trim().length < 2} onClick={saveTemplate}>
                  Save as template
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">After making a report you can add photos to it from its page.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-bold">Reports</h2>
        {reports.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No reports yet.</CardContent>
          </Card>
        ) : (
          reports.map((report) => <ReportRow key={report.id} report={report} canDelete={canDelete} canPublish={canPublish} />)
        )}
      </div>
    </div>
  );
}

function ReportRow({ report, canDelete, canPublish }: { report: SavedMonthlyReport; canDelete: boolean; canPublish: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const languageName = REPORT_LANGUAGES.find((l) => l.value === report.language)?.label.split(" ")[0] ?? "English";

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{report.title}</span>
            <Badge variant="outline">{report.kind === "annual" ? "Annual" : "Monthly"}</Badge>
            <Badge variant="outline">{languageName}</Badge>
            {report.data.narrative && (
              <Badge variant="outline" className="gap-1">
                <Sparkles className="size-3" />
                AI summary
              </Badge>
            )}
            {report.published ? (
              <Badge className="gap-1">
                <Smartphone className="size-3" />
                Shown to members in the app
              </Badge>
            ) : (
              <Badge variant="secondary">Not published</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Made {new Date(report.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {report.data.sections?.length ?? 0} sections · {report.data.photos?.length ?? 0} photos
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/reports/monthly/${report.id}`} />}>
            <Eye className="size-3.5" />
            View
          </Button>
          {canPublish && (
            <Button
              type="button"
              size="sm"
              variant={report.published ? "outline" : "default"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setMonthlyReportPublishedAction(report.id, !report.published);
                  setError(result.error ?? null);
                })
              }
            >
              {report.published ? "Unpublish" : "Publish to the app"}
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Delete the ${report.title}?`)) return;
                startTransition(async () => {
                  const result = await deleteMonthlyReportAction(report.id);
                  setError(result.error ?? null);
                });
              }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
