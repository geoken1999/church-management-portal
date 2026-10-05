"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Search, Send, Sparkles, TriangleAlert, FileText, RefreshCw, Trash2, User } from "lucide-react";
import {
  sendBulkWhatsAppAction,
  sendWhatsAppReplyAction,
  markWhatsAppConversationRead,
  getWhatsAppAiMode,
  setWhatsAppAiMode,
  getWhatsAppAiTypingState,
  createWhatsAppTemplateAction,
  refreshWhatsAppTemplateStatusAction,
  deleteWhatsAppTemplateAction,
  generateWhatsAppTemplateBodyAction,
  type SendWhatsAppState,
  type TemplateFormState,
} from "@/lib/whatsapp/actions";
import { normalizePhoneNumber, countTemplateVariables, validateWhatsAppTemplatePlaceholders } from "@/lib/whatsapp/validation";
import { MEMBER_FIELDS, validatePlaceholderSpec, type MemberField, type PlaceholderSpec } from "@/lib/whatsapp/placeholders";
import type { WhatsAppTemplateCategory, WhatsAppTemplateStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

// One placeholder as the composer edits it: a typed value for everyone, or a
// member field with a fallback for numbers that aren't members.
interface PlaceholderDraft {
  mode: "fixed" | "member";
  value: string;
  field: MemberField;
  fallback: string;
}

function emptyPlaceholder(): PlaceholderDraft {
  return { mode: "fixed", value: "", field: "first_name", fallback: "Friend" };
}

function toPlaceholderSpec(draft: PlaceholderDraft): PlaceholderSpec {
  return draft.mode === "fixed" ? { kind: "fixed", value: draft.value } : { kind: "member", field: draft.field, fallback: draft.fallback };
}

function placeholderChoiceLabel(choice: string): string {
  if (choice === "fixed") return "One value for everyone";
  return MEMBER_FIELDS.find((f) => f.key === choice)?.label ?? choice;
}

// How often the WhatsApp inbox re-fetches while the tab is open.
const WHATSAPP_INBOX_REFRESH_MS = 5000;

export interface WhatsAppRecipientOption {
  id: string;
  name: string;
  phone: string;
  countryCode: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface WhatsAppBranchOption {
  id: string;
  name: string;
}

export interface WhatsAppTemplateRow {
  id: string;
  name: string;
  category: WhatsAppTemplateCategory;
  body_text: string;
  variable_count: number;
  status: WhatsAppTemplateStatus;
  rejected_reason: string | null;
  meta_template_id: string | null;
}

export interface WhatsAppCampaignRow {
  id: string;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "sent" | "partial_failure" | "failed";
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
  whatsapp_templates: { name: string } | null;
}

export interface WhatsAppMessageRow {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
}

export interface WhatsAppConversationRow {
  id: string;
  phone_number: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  members: { id: string; first_name: string; last_name: string } | null;
  messages: WhatsAppMessageRow[];
}

function parseExtraNumbers(raw: string, countryCode: string | null): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((entry) => normalizePhoneNumber(entry, countryCode))
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templateInitialState: TemplateFormState = {};

function templateStatusBadge(status: WhatsAppTemplateStatus) {
  if (status === "approved") return <Badge variant="secondary">Approved</Badge>;
  if (status === "pending_review") return <Badge variant="outline">Pending review</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (status === "disabled" || status === "paused") return <Badge variant="destructive">{status === "disabled" ? "Disabled" : "Paused"}</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

// Ready-made starting points, already in the numbered-placeholder format
// Meta requires — the easiest way to avoid the INVALID_FORMAT rejection
// a hand-written {{name}}-style placeholder causes (see
// validateWhatsAppTemplatePlaceholders). Covers the three most common
// church use cases; editable after picking one.
const TEMPLATE_PRESETS: { label: string; category: WhatsAppTemplateCategory; bodyText: string; exampleValues: string[] }[] = [
  {
    label: "Sunday service reminder",
    category: "utility",
    bodyText: "Hi {{1}}, our service starts at 10 AM every Sunday. We'd love to see you there on time to receive the blessings!",
    exampleValues: ["John"],
  },
  {
    label: "Event invitation",
    category: "marketing",
    bodyText: "Hi {{1}}, you're invited to {{2}} on {{3}}. We hope to see you there!",
    exampleValues: ["John", "Youth Camp 2026", "March 14"],
  },
  {
    label: "General announcement",
    category: "utility",
    bodyText: "Hi {{1}}, {{2}}",
    exampleValues: ["John", "we have an important update for you."],
  },
];

function AiTemplateGenerator({
  organizationId,
  onGenerated,
}: {
  organizationId: string;
  onGenerated: (result: { bodyText: string; exampleValues: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateWhatsAppTemplateBodyAction(organizationId, draft);
      if (result.error || !result.bodyText) {
        setError(result.error ?? "Couldn't generate a template. Try again.");
        return;
      }
      onGenerated({ bodyText: result.bodyText, exampleValues: result.exampleValues ?? [] });
      setOpen(false);
      setDraft("");
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" />
        Generate with AI
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <Label className="text-xs">Describe the message in plain English</Label>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Remind members that Sunday service starts at 10 AM and they should come on time"
        rows={2}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleGenerate} disabled={pending || !draft.trim()}>
          {pending ? "Generating..." : "Generate"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function NewTemplateForm({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<TemplateFormState>(templateInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WhatsAppTemplateCategory>("utility");
  const [bodyText, setBodyText] = useState("");
  const [exampleValues, setExampleValues] = useState<string[]>([]);

  const variableCount = countTemplateVariables(bodyText);
  const placeholderError = bodyText.trim() ? validateWhatsAppTemplatePlaceholders(bodyText) : undefined;

  function handleBodyChange(value: string) {
    setBodyText(value);
    const count = countTemplateVariables(value);
    setExampleValues((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? ""));
  }

  function applyPreset(preset: (typeof TEMPLATE_PRESETS)[number]) {
    setCategory(preset.category);
    setBodyText(preset.bodyText);
    setExampleValues(preset.exampleValues);
  }

  function applyGenerated(result: { bodyText: string; exampleValues: string[] }) {
    setBodyText(result.bodyText);
    setExampleValues(result.exampleValues);
  }

  function handleSubmit() {
    setState({});
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("name", name);
    formData.set("category", category);
    formData.set("bodyText", bodyText);
    formData.set("exampleValues", JSON.stringify(exampleValues));

    startTransition(async () => {
      const result = await createWhatsAppTemplateAction(state, formData);
      setState(result);
      if (result.success) {
        setOpen(false);
        setName("");
        setBodyText("");
        setExampleValues([]);
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        New template
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New WhatsApp template</CardTitle>
        <CardDescription>
          Submitted to WhatsApp for review — approval usually takes a few minutes to a few hours, sometimes longer. Use{" "}
          <code className="rounded bg-muted px-1 py-0.5">{"{{1}}"}</code>, <code className="rounded bg-muted px-1 py-0.5">{"{{2}}"}</code>, etc., in
          order, for fill-in-the-blank placeholders — never a named one like <code className="rounded bg-muted px-1 py-0.5">{"{{name}}"}</code>, which
          WhatsApp rejects. Pick a quick-start template below, or describe your message and let AI format it correctly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="template-name" className="text-xs">
              Name
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="sunday_reminder"
              pattern="[a-z0-9_]+"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory((v ?? "utility") as WhatsAppTemplateCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => category.charAt(0).toUpperCase() + category.slice(1)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utility">Utility</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Quick start</Label>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_PRESETS.map((preset) => (
              <Button key={preset.label} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset)}>
                {preset.label}
              </Button>
            ))}
            <AiTemplateGenerator organizationId={organizationId} onGenerated={applyGenerated} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="template-body" className="text-xs">
            Message
          </Label>
          <Textarea
            id="template-body"
            value={bodyText}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Hi {{1}}, this Sunday's service starts at 10am. See you there!"
            rows={3}
          />
          {placeholderError && <p className="text-xs text-destructive">{placeholderError}</p>}
        </div>
        {variableCount > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Example values (shown to WhatsApp&apos;s reviewers)</Label>
            {Array.from({ length: variableCount }, (_, i) => (
              <Input
                key={i}
                value={exampleValues[i] ?? ""}
                onChange={(e) =>
                  setExampleValues((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })
                }
                placeholder={`Example for {{${i + 1}}}`}
              />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleSubmit} disabled={pending || !name.trim() || !bodyText.trim() || !!placeholderError}>
            {pending ? "Submitting..." : "Submit for review"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateRow({ template, canManage }: { template: WhatsAppTemplateRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshWhatsAppTemplateStatusAction(template.id);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete the "${template.name}" template? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteWhatsAppTemplateAction(template.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-1.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{template.name}</span>
            {templateStatusBadge(template.status)}
            <Badge variant="outline">{template.category}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{template.body_text}</p>
          {template.status === "rejected" &&
            (template.rejected_reason ? (
              <p className="mt-1 text-xs text-destructive">Rejected: {template.rejected_reason}</p>
            ) : (
              <p className="mt-1 text-xs text-destructive">Rejected — click refresh to see why.</p>
            ))}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {/* Shown for anything short of approved, not just
                pending_review — a template can come back REJECTED
                immediately on creation (synchronous policy violations),
                and this is the only way to fetch why. */}
            {template.meta_template_id && template.status !== "approved" && (
              <Button type="button" size="icon" variant="ghost" onClick={handleRefresh} disabled={pending} title="Check for a status update">
                <RefreshCw className="size-4" />
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" onClick={handleDelete} disabled={pending} title="Delete template">
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TemplatesManager({ organizationId, templates, canManage }: { organizationId: string; templates: WhatsAppTemplateRow[]; canManage: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          Message templates
        </CardTitle>
        <CardDescription>
          Campaigns can only send a pre-approved template — WhatsApp requires this for any message to someone who hasn&apos;t messaged you in the last 24
          hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && <NewTemplateForm organizationId={organizationId} />}
        <div className="divide-y divide-border">
          {templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            templates.map((template) => <TemplateRow key={template.id} template={template} canManage={canManage} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recipient picker (mirrors SMS's — same shape, WhatsApp instead of SMS)
// ---------------------------------------------------------------------------

function RecipientPicker({
  members,
  branches,
  selectedIds,
  onToggle,
  onSelectAll,
  extraNumbers,
  onExtraNumbersChange,
  orgCountryCode,
  disabled,
}: {
  members: WhatsAppRecipientOption[];
  branches: WhatsAppBranchOption[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[], checked: boolean) => void;
  extraNumbers: string;
  onExtraNumbersChange: (value: string) => void;
  orgCountryCode: string | null;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState<string>("all");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      if (branchId !== "all" && m.branchId !== branchId) return false;
      if (!term) return true;
      return m.name.toLowerCase().includes(term) || m.phone.includes(term);
    });
  }, [members, search, branchId]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));
  const extraCount = parseExtraNumbers(extraNumbers, orgCountryCode).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members by name or phone" className="pl-8" disabled={disabled} />
        </div>
        {branches.length > 0 && (
          <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "all")} disabled={disabled}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue>{() => (branchId === "all" ? "All branches" : (branches.find((b) => b.id === branchId)?.name ?? "All branches"))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <label className={disabled ? "flex cursor-not-allowed items-center gap-2 border-b border-border px-3 py-2 text-sm opacity-50" : "flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm"}>
          <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => onSelectAll(filtered.map((m) => m.id), checked === true)} aria-label="Select all filtered members" disabled={disabled} />
          Select all ({filtered.length})
        </label>
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No members match.</p>
          ) : (
            filtered.map((member) => (
              <label key={member.id} className={disabled ? "flex cursor-not-allowed items-center gap-2 px-3 py-2 text-sm opacity-50" : "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent"}>
                <Checkbox checked={selectedIds.has(member.id)} onCheckedChange={() => onToggle(member.id)} aria-label={`Select ${member.name}`} disabled={disabled} />
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
                <span className="shrink-0 truncate text-xs text-muted-foreground">{member.phone}</span>
                {!member.countryCode && (
                  <Badge variant="destructive" className="shrink-0">
                    <TriangleAlert className="size-3" />
                    No country
                  </Badge>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whatsapp-extra-numbers">Additional phone numbers</Label>
        <Textarea id="whatsapp-extra-numbers" value={extraNumbers} onChange={(e) => onExtraNumbersChange(e.target.value)} placeholder="One per line or comma-separated — for people who aren't members" rows={2} disabled={disabled} />
        {extraCount > 0 && <p className="text-xs text-muted-foreground">{extraCount} valid extra number{extraCount === 1 ? "" : "s"}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({
  organizationId,
  members,
  branches,
  templates,
  available,
  whatsappRemaining,
  orgCountryCode,
}: {
  organizationId: string;
  members: WhatsAppRecipientOption[];
  branches: WhatsAppBranchOption[];
  templates: WhatsAppTemplateRow[];
  available: boolean;
  whatsappRemaining: number;
  orgCountryCode: string | null;
}) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [placeholders, setPlaceholders] = useState<PlaceholderDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraNumbers, setExtraNumbers] = useState("");
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;
  const disabled = !available || templates.length === 0;
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const extraCount = parseExtraNumbers(extraNumbers, orgCountryCode).length;
  const totalRecipients = selectedIds.size + extraCount;

  const selectedWithoutCountry = Array.from(selectedIds)
    .map((id) => membersById.get(id))
    .filter((m): m is WhatsAppRecipientOption => Boolean(m && !m.countryCode));

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const next = templates.find((t) => t.id === id);
    setPlaceholders(Array.from({ length: next?.variable_count ?? 0 }, () => emptyPlaceholder()));
  }

  function updatePlaceholder(index: number, patch: Partial<PlaceholderDraft>) {
    setPlaceholders((prev) => prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function handleSend() {
    setResult(null);

    if (selectedWithoutCountry.length > 0) {
      setResult({ error: `${selectedWithoutCountry.length} selected recipient${selectedWithoutCountry.length === 1 ? " has" : "s have"} no country set, so their number can't be sent to yet.` });
      return;
    }

    // Members carry their id so their own name and branch can fill the
    // placeholders. Typed-in numbers don't, and get each placeholder's fallback.
    const recipients = [
      ...Array.from(selectedIds)
        .map((id) => membersById.get(id))
        .filter((m): m is WhatsAppRecipientOption => Boolean(m))
        .map((m) => ({ phone: m.phone, countryCode: m.countryCode, memberId: m.id })),
      ...parseExtraNumbers(extraNumbers, orgCountryCode).map((phone) => ({ phone, countryCode: orgCountryCode, memberId: null })),
    ];

    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("templateId", templateId);
    formData.set("placeholderSpecs", JSON.stringify(placeholders.map(toPlaceholderSpec)));
    formData.set("recipients", JSON.stringify(recipients));

    startTransition(async () => {
      const response: SendWhatsAppState = await sendBulkWhatsAppAction(formData);
      if (response.error) {
        setResult({ error: response.error });
        return;
      }
      setResult({ success: `Sent to ${response.sentCount} recipient${response.sentCount === 1 ? "" : "s"}${response.failedCount ? ` (${response.failedCount} failed)` : ""}.` });
      setSelectedIds(new Set());
      setExtraNumbers("");
    });
  }

  const placeholdersReady = placeholders.every((draft) => !validatePlaceholderSpec(toPlaceholderSpec(draft)));
  const canSend = !disabled && Boolean(template) && placeholdersReady && totalRecipients > 0 && selectedWithoutCountry.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-primary" />
          Compose
          {disabled ? <Badge variant="destructive">Offline</Badge> : <Badge variant="secondary">Online</Badge>}
        </CardTitle>
        <CardDescription>Send an announcement or reminder using an approved WhatsApp template.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {templates.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>No approved templates yet — create one in the Templates tab and wait for WhatsApp to approve it before sending a campaign.</AlertDescription>
          </Alert>
        )}
        {!available && templates.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>WhatsApp sending is offline — either it isn&apos;t configured, or your plan&apos;s monthly limit has been reached. Upgrade your plan or buy an add-on pack.</AlertDescription>
          </Alert>
        )}
        {available && whatsappRemaining <= 20 && (
          <Alert>
            <AlertDescription>{whatsappRemaining.toLocaleString()} WhatsApp messages left this month.</AlertDescription>
          </Alert>
        )}
        {result?.error && (
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}
        {result?.success && (
          <Alert>
            <AlertDescription>{result.success}</AlertDescription>
          </Alert>
        )}

        {templates.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <Select value={templateId} onValueChange={(v) => handleSelectTemplate(v ?? "")} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => template?.name ?? "Select a template"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {template && <p className="text-sm text-muted-foreground">{template.body_text}</p>}
          </div>
        )}

        {template && template.variable_count > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Fill in the template</Label>
            {placeholders.map((draft, i) => {
              const choice = draft.mode === "member" ? draft.field : "fixed";
              return (
                <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Placeholder {`{{${i + 1}}}`}</p>
                  <Select
                    value={choice}
                    onValueChange={(v) => {
                      if (v === "fixed") updatePlaceholder(i, { mode: "fixed" });
                      else updatePlaceholder(i, { mode: "member", field: v as MemberField });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{() => placeholderChoiceLabel(choice)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">One value for everyone</SelectItem>
                      {MEMBER_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draft.mode === "fixed" ? (
                    <Input
                      value={draft.value}
                      onChange={(e) => updatePlaceholder(i, { value: e.target.value })}
                      placeholder="The text sent to every recipient"
                      disabled={disabled}
                    />
                  ) : (
                    <Input
                      value={draft.fallback}
                      onChange={(e) => updatePlaceholder(i, { fallback: e.target.value })}
                      placeholder="Used for numbers that aren't members, e.g. Friend"
                      disabled={disabled}
                    />
                  )}
                </div>
              );
            })}
            {placeholders.some((d) => d.mode === "member") && (
              <p className="text-xs text-muted-foreground">Each member gets their own name or branch. Numbers typed in get the fallback text.</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Recipients</Label>
          <RecipientPicker members={members} branches={branches} selectedIds={selectedIds} onToggle={toggle} disabled={disabled} onSelectAll={selectAll} extraNumbers={extraNumbers} onExtraNumbersChange={setExtraNumbers} orgCountryCode={orgCountryCode} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{totalRecipients} recipient{totalRecipients === 1 ? "" : "s"} selected</p>
          <Button type="button" onClick={handleSend} disabled={!canSend || pending}>
            <Send className="size-4" />
            {pending ? "Sending..." : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function statusBadge(status: WhatsAppCampaignRow["status"]) {
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (status === "partial_failure") return <Badge variant="outline">Partially sent</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
}

function WhatsAppHistory({ campaigns }: { campaigns: WhatsAppCampaignRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send history</CardTitle>
        <CardDescription>The last {campaigns.length} message{campaigns.length === 1 ? "" : "s"} sent to this organization.</CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages sent yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{campaign.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {campaign.sent_count}/{campaign.recipient_count} delivered
                    {campaign.whatsapp_templates ? ` · ${campaign.whatsapp_templates.name}` : ""}
                    {campaign.profiles ? ` · ${campaign.profiles.first_name} ${campaign.profiles.last_name}` : ""}
                  </p>
                </div>
                {statusBadge(campaign.status)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const AI_TYPING_POLL_MS = 2000;

function ChatThread({
  organizationId,
  conversationId,
  phoneNumber,
  messages,
}: {
  organizationId: string;
  conversationId: string;
  phoneNumber: string;
  messages: WhatsAppMessageRow[];
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiMode, setAiModeState] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiModePending, startAiModeTransition] = useTransition();

  useEffect(() => {
    getWhatsAppAiMode(organizationId, phoneNumber).then(setAiModeState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only polled while AI mode is actually on — same reasoning as the
  // Instagram conversation view's identical effect.
  useEffect(() => {
    if (!aiMode) return;
    function poll() {
      getWhatsAppAiTypingState(organizationId, phoneNumber).then(setAiTyping);
    }
    poll();
    const interval = setInterval(poll, AI_TYPING_POLL_MS);
    return () => clearInterval(interval);
  }, [aiMode, organizationId, phoneNumber]);

  function handleToggleAiMode() {
    const next = !aiMode;
    setAiModeState(next);
    startAiModeTransition(() => setWhatsAppAiMode(organizationId, phoneNumber, next));
  }

  function handleSend() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await sendWhatsAppReplyAction(conversationId, body);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBody("");
    });
  }

  const replyDisabled = pending || (aiMode && aiTyping);

  return (
    <div className="flex h-[28rem] flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border px-3 py-2">
        <Button
          type="button"
          variant={aiMode ? "default" : "outline"}
          size="sm"
          onClick={handleToggleAiMode}
          disabled={aiModePending}
          title="When on, AI replies to this person automatically with no review"
        >
          <Sparkles className="size-3.5" />
          AI mode {aiMode ? "on" : "off"}
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${message.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="whitespace-pre-line">{message.body}</p>
                <p className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(message.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
        {aiMode && aiTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              <span className="text-xs text-muted-foreground">AI is typing...</span>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={aiMode && aiTyping ? "AI is replying..." : "Type a reply..."}
            rows={2}
            className="flex-1"
            disabled={replyDisabled}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
          />
          <Button type="button" size="icon" onClick={handleSend} disabled={replyDisabled || !body.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Free-form replies only work within 24 hours of their last message to you.</p>
      </div>
    </div>
  );
}

function ChatInbox({ organizationId, conversations }: { organizationId: string; conversations: WhatsAppConversationRow[] }) {
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  const [, startTransition] = useTransition();

  function selectConversation(id: string) {
    setActiveId(id);
    const conversation = conversations.find((c) => c.id === id);
    if (conversation && conversation.unread_count > 0) {
      startTransition(() => {
        markWhatsAppConversationRead(id);
      });
    }
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MessageCircle className="size-8 text-muted-foreground" />
          <div>
            <h3 className="font-heading text-base font-bold">No conversations yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Once someone messages your WhatsApp number, their conversation will show up here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  return (
    <Card className="overflow-hidden py-0">
      <div className="grid grid-cols-1 sm:grid-cols-[16rem_1fr]">
        <div className="max-h-[28rem] overflow-y-auto border-b border-border sm:max-h-none sm:border-r sm:border-b-0">
          {conversations.map((conversation) => {
            const name = conversation.members ? `${conversation.members.first_name} ${conversation.members.last_name}` : conversation.phone_number;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className={`flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm hover:bg-accent ${active?.id === conversation.id ? "bg-accent" : ""}`}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{name}</span>
                    {conversation.unread_count > 0 && <Badge>{conversation.unread_count}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{conversation.last_message_preview}</p>
                </div>
              </button>
            );
          })}
        </div>
        <div>
          {active && (
            <ChatThread
              key={active.id}
              organizationId={organizationId}
              conversationId={active.id}
              phoneNumber={active.phone_number}
              messages={active.messages}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function WhatsAppManager({
  organizationId,
  canSend,
  isOrgAdmin,
  available,
  whatsappRemaining,
  members,
  branches,
  templates,
  campaigns,
  conversations,
  orgCountryCode,
}: {
  organizationId: string;
  canSend: boolean;
  isOrgAdmin: boolean;
  available: boolean;
  whatsappRemaining: number;
  members: WhatsAppRecipientOption[];
  branches: WhatsAppBranchOption[];
  templates: WhatsAppTemplateRow[];
  campaigns: WhatsAppCampaignRow[];
  conversations: WhatsAppConversationRow[];
  orgCountryCode: string | null;
}) {
  const approvedTemplates = templates.filter((t) => t.status === "approved");

  // Conversations and their messages come from the server when the page loads.
  // Re-fetch them on an interval, and as soon as the tab is back in view, so
  // inbound messages show up without a manual refresh. Only while the tab is
  // visible, so a background tab doesn't keep querying.
  const router = useRouter();
  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const interval = setInterval(refreshIfVisible, WHATSAPP_INBOX_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="campaigns">Campaigns</TabsTab>
          <TabsTab value="templates">Templates</TabsTab>
          <TabsTab value="chat">Chat</TabsTab>
        </TabsList>
        <TabsPanel value="campaigns">
          <div className="space-y-6">
            {canSend ? (
              <Composer
                organizationId={organizationId}
                members={members}
                branches={branches}
                templates={approvedTemplates}
                available={available}
                whatsappRemaining={whatsappRemaining}
                orgCountryCode={orgCountryCode}
              />
            ) : (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  You don&apos;t have permission to send WhatsApp messages. You can still view what&apos;s been sent below.
                </CardContent>
              </Card>
            )}
            <WhatsAppHistory campaigns={campaigns} />
          </div>
        </TabsPanel>
        <TabsPanel value="templates">
          <TemplatesManager organizationId={organizationId} templates={templates} canManage={isOrgAdmin} />
        </TabsPanel>
        <TabsPanel value="chat">
          <ChatInbox organizationId={organizationId} conversations={conversations} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
