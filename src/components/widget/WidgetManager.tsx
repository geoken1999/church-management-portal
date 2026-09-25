"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutTemplate,
  Copy,
  Check,
  Power,
  Inbox,
  ExternalLink,
} from "lucide-react";
import {
  createWidget,
  updateWidgetSettings,
  toggleWidgetEnabled,
  setWidgetSubmissionStatus,
  deleteWidgetSubmission,
  type WidgetCreateState,
  type WidgetSettingsState,
} from "@/lib/widget/actions";
import { FORM_FIELD_TYPES, WIDGET_POSITIONS } from "@/lib/widget/validation";
import { slugifyFieldKey, validateFormField } from "@/lib/forms/validation";
import type { FormField, FormFieldType, WebsiteWidget, WidgetSubmission, WidgetSubmissionStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

const createInitialState: WidgetCreateState = {};
const settingsInitialState: WidgetSettingsState = {};

const STATUS_LABELS: Record<WidgetSubmissionStatus, string> = { new: "New", read: "Read", archived: "Archived" };
const STATUS_VARIANTS: Record<WidgetSubmissionStatus, "default" | "secondary" | "outline"> = {
  new: "default",
  read: "secondary",
  archived: "outline",
};

function uniqueKey(base: string, existing: Set<string>): string {
  let key = base || "field";
  let attempt = 1;
  while (existing.has(key)) {
    attempt += 1;
    key = `${base || "field"}_${attempt}`;
  }
  return key;
}

function EmptyWidgetState({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<WidgetCreateState>(createInitialState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createWidget(state, formData);
      setState(result);
      if (result.success) router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <LayoutTemplate className="size-8 text-muted-foreground" />
        <div>
          <h3 className="font-heading text-base font-bold">Set up your website widget</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A small chat bubble you embed on your own website to capture visitor queries — name, contact info, and a
            message — straight into KingdomFlow.
          </p>
        </div>
        {state.error && (
          <Alert variant="destructive" className="max-w-sm text-left">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <form action={handleSubmit}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <Button type="submit" disabled={pending}>
            <Plus className="size-4" />
            {pending ? "Creating..." : "Create widget"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldEditorRow({
  field,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  errors,
}: {
  field: FormField;
  index: number;
  total: number;
  onChange: (field: FormField) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  errors?: { label?: string; options?: string };
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
              <ArrowUp className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
              <ArrowDown className="size-3.5" />
            </Button>
          </div>
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Field label</Label>
                <Input
                  value={field.label}
                  onChange={(e) => onChange({ ...field, label: e.target.value })}
                  placeholder="Full name"
                  aria-invalid={Boolean(errors?.label)}
                />
                <FieldError id={`field-${index}-label-error`} message={errors?.label} />
              </div>
              <div className="space-y-1.5">
                <Label>Field type</Label>
                <Select
                  value={field.field_type}
                  onValueChange={(v) => onChange({ ...field, field_type: (v ?? "text") as FormFieldType })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string | null) => FORM_FIELD_TYPES.find((t) => t.value === v)?.label ?? "Select a type"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {field.field_type === "select" && (
              <div className="space-y-1.5">
                <Label>Options (one per line)</Label>
                <Textarea
                  value={field.options?.join("\n") ?? ""}
                  onChange={(e) => onChange({ ...field, options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
                  placeholder={"Member\nVisitor\nGuest"}
                  rows={3}
                  aria-invalid={Boolean(errors?.options)}
                />
                <FieldError id={`field-${index}-options-error`} message={errors?.options} />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={field.required} onCheckedChange={(checked) => onChange({ ...field, required: checked === true })} />
              Required
            </label>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove field">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WidgetPreview({
  primaryColor,
  buttonLabel,
  greetingTitle,
  greetingMessage,
  fields,
}: {
  primaryColor: string;
  buttonLabel: string;
  greetingTitle: string;
  greetingMessage: string;
  fields: FormField[];
}) {
  return (
    <Card className="sticky top-4">
      <CardContent className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Live preview</p>
        <div className="overflow-hidden rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 text-white" style={{ backgroundColor: primaryColor }}>
            <p className="text-sm font-semibold">{greetingTitle || "Get in touch"}</p>
          </div>
          <div className="space-y-3 bg-card p-4">
            <p className="text-xs text-muted-foreground">{greetingMessage || "Have a question? Send us a message."}</p>
            {fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <p className="text-xs font-medium">
                  {field.label || "Untitled field"}
                  {field.required && <span className="text-destructive"> *</span>}
                </p>
                <div className="h-8 rounded-md border border-border bg-muted/40" />
              </div>
            ))}
            <div className="rounded-md py-2 text-center text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>
              Submit
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="flex size-11 items-center justify-center rounded-full text-white shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            <LayoutTemplate className="size-5" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {buttonLabel || "Chat with us"} — this is how the bubble looks collapsed on your site.
        </p>
      </CardContent>
    </Card>
  );
}

function DesignTab({ widget, canWrite }: { widget: WebsiteWidget; canWrite: boolean }) {
  const [primaryColor, setPrimaryColor] = useState(widget.primary_color);
  const [buttonLabel, setButtonLabel] = useState(widget.button_label);
  const [greetingTitle, setGreetingTitle] = useState(widget.greeting_title);
  const [greetingMessage, setGreetingMessage] = useState(widget.greeting_message);
  const [position, setPosition] = useState(widget.position);
  const [fields, setFields] = useState<FormField[]>(widget.fields);
  const [state, setState] = useState<WidgetSettingsState>(settingsInitialState);
  const [fieldErrors, setFieldErrors] = useState<Record<number, { label?: string; options?: string }>>({});
  const [pending, startTransition] = useTransition();

  function addField() {
    const existing = new Set(fields.map((f) => f.key));
    setFields([...fields, { key: uniqueKey("field", existing), label: "", field_type: "text", options: null, required: false }]);
  }

  function updateField(index: number, next: FormField) {
    setFields(fields.map((f, i) => (i === index ? next : f)));
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  function handleSubmit(formData: FormData) {
    const seenKeys = new Set<string>();
    const nextFieldErrors: Record<number, { label?: string; options?: string }> = {};
    let hasErrors = false;

    const finalFields = fields.map((field, index) => {
      const errors = validateFormField({ label: field.label, fieldType: field.field_type, options: field.options ?? [] });
      if (Object.values(errors).some(Boolean)) {
        nextFieldErrors[index] = errors;
        hasErrors = true;
      }
      const key = uniqueKey(slugifyFieldKey(field.label) || field.key, seenKeys);
      seenKeys.add(key);
      return { ...field, key };
    });

    setFieldErrors(nextFieldErrors);
    if (hasErrors) return;

    setFields(finalFields);
    formData.set("fields", JSON.stringify(finalFields));

    startTransition(async () => {
      const result = await updateWidgetSettings(state, formData);
      setState(result);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form action={handleSubmit} className="space-y-6">
        <input type="hidden" name="widgetId" value={widget.id} />
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="greetingTitle">Greeting title</Label>
            <Input
              id="greetingTitle"
              name="greetingTitle"
              value={greetingTitle}
              onChange={(e) => setGreetingTitle(e.target.value)}
              disabled={!canWrite}
              aria-invalid={Boolean(state.fieldErrors?.greetingTitle)}
            />
            <FieldError id="greetingTitle-error" message={state.fieldErrors?.greetingTitle} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buttonLabel">Bubble label</Label>
            <Input
              id="buttonLabel"
              name="buttonLabel"
              value={buttonLabel}
              onChange={(e) => setButtonLabel(e.target.value)}
              disabled={!canWrite}
              aria-invalid={Boolean(state.fieldErrors?.buttonLabel)}
            />
            <FieldError id="buttonLabel-error" message={state.fieldErrors?.buttonLabel} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="greetingMessage">Greeting message</Label>
          <Textarea
            id="greetingMessage"
            name="greetingMessage"
            rows={2}
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            disabled={!canWrite}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="primaryColor">Brand color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                disabled={!canWrite}
                className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
                aria-label="Brand color picker"
              />
              <Input
                id="primaryColor"
                name="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                disabled={!canWrite}
                aria-invalid={Boolean(state.fieldErrors?.primaryColor)}
              />
            </div>
            <FieldError id="primaryColor-error" message={state.fieldErrors?.primaryColor} />
          </div>
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Select name="position" value={position} onValueChange={(v) => setPosition((v ?? "bottom-right") as typeof position)} disabled={!canWrite}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string | null) => WIDGET_POSITIONS.find((p) => p.value === v)?.label ?? "Select a position"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WIDGET_POSITIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Form fields</Label>
          {fields.map((field, index) => (
            <FieldEditorRow
              key={index}
              field={field}
              index={index}
              total={fields.length}
              onChange={(next) => updateField(index, next)}
              onRemove={() => removeField(index)}
              onMove={(direction) => moveField(index, direction)}
              errors={fieldErrors[index]}
            />
          ))}
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addField}>
              <Plus className="size-4" />
              Add field
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </form>

      <WidgetPreview
        primaryColor={primaryColor}
        buttonLabel={buttonLabel}
        greetingTitle={greetingTitle}
        greetingMessage={greetingMessage}
        fields={fields}
      />
    </div>
  );
}

function EmbedTab({ widget, siteUrl, canWrite }: { widget: WebsiteWidget; siteUrl: string; canWrite: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const snippet = `<script src="${siteUrl}/widget/loader.js?token=${widget.share_token}" async></script>`;
  const previewUrl = `${siteUrl}/widget/${widget.share_token}`;

  function handleToggle() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("widgetId", widget.id);
      formData.set("enabled", widget.enabled ? "false" : "true");
      await toggleWidgetEnabled(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Power className={widget.enabled ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
            <div>
              <p className="text-sm font-medium">{widget.enabled ? "Widget is live" : "Widget is disabled"}</p>
              <p className="text-xs text-muted-foreground">
                {widget.enabled ? "It will accept messages wherever it's embedded." : "The embedded bubble won't appear on your site."}
              </p>
            </div>
          </div>
          {canWrite && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleToggle}>
              {widget.enabled ? "Disable" : "Enable"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Embed code</p>
          <p className="text-xs text-muted-foreground">
            Paste this once, right before the closing <code>&lt;/body&gt;</code> tag, on every page of your website.
          </p>
          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
              <code>{snippet}</code>
            </pre>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                navigator.clipboard.writeText(snippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label="Copy embed code"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="size-3.5" />
            Preview the widget on its own page
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmissionCard({
  submission,
  fields,
  canWrite,
  canDelete,
}: {
  submission: WidgetSubmission;
  fields: FormField[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(status: WidgetSubmissionStatus) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("submissionId", submission.id);
      formData.set("widgetId", submission.widget_id);
      formData.set("status", status);
      await setWidgetSubmissionStatus(formData);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANTS[submission.status]}>{STATUS_LABELS[submission.status]}</Badge>
            <p className="text-xs text-muted-foreground">{new Date(submission.created_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && submission.status === "new" && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setStatus("read")}>
                Mark read
              </Button>
            )}
            {canWrite && submission.status !== "archived" && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setStatus("archived")}>
                Archive
              </Button>
            )}
            {canDelete && (
              <form action={deleteWidgetSubmission}>
                <input type="hidden" name="submissionId" value={submission.id} />
                <input type="hidden" name="widgetId" value={submission.widget_id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            )}
          </div>
        </div>
        {submission.page_url && <p className="truncate text-xs text-muted-foreground">From: {submission.page_url}</p>}
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fields.map((field) => {
            const value = submission.answers[field.key];
            return (
              <div key={field.key}>
                <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
                <dd className="text-sm">
                  {value === null || value === undefined || value === ""
                    ? "—"
                    : typeof value === "boolean"
                      ? value
                        ? "Yes"
                        : "No"
                      : String(value)}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

export function WidgetManager({
  organizationId,
  siteUrl,
  widget,
  submissions,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  siteUrl: string;
  widget: WebsiteWidget | null;
  submissions: WidgetSubmission[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  if (!widget) {
    return <EmptyWidgetState organizationId={organizationId} />;
  }

  const newCount = submissions.filter((s) => s.status === "new").length;

  return (
    <Tabs defaultValue="design">
      <TabsList>
        <TabsIndicator />
        <TabsTab value="design">Design</TabsTab>
        <TabsTab value="embed">Embed</TabsTab>
        <TabsTab value="submissions">
          Submissions ({submissions.length}){newCount > 0 && ` · ${newCount} new`}
        </TabsTab>
      </TabsList>

      <TabsPanel value="design">
        <DesignTab widget={widget} canWrite={canWrite} />
      </TabsPanel>

      <TabsPanel value="embed">
        <EmbedTab widget={widget} siteUrl={siteUrl} canWrite={canWrite} />
      </TabsPanel>

      <TabsPanel value="submissions">
        {submissions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Inbox className="size-8 text-muted-foreground" />
              <div>
                <h3 className="font-heading text-base font-bold">No messages yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Once your widget is embedded and enabled, visitor submissions will show up here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <SubmissionCard key={submission.id} submission={submission} fields={widget.fields} canWrite={canWrite} canDelete={canDelete} />
            ))}
          </div>
        )}
      </TabsPanel>
    </Tabs>
  );
}
