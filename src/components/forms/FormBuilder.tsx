"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, Link2, Save } from "lucide-react";
import { updateForm, setFormStatus, deleteFormResponse, type FormMetaState } from "@/lib/forms/actions";
import { FORM_FIELD_TYPES, slugifyFieldKey, validateFormField } from "@/lib/forms/validation";
import type { CustomForm, FormField, FormFieldType, FormResponse, FormStatus } from "@/types/database";
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
import { QrCodeDialog } from "@/components/members/QrCodeDialog";

const initialState: FormMetaState = {};

const STATUS_LABELS: Record<FormStatus, string> = { draft: "Draft", published: "Published", closed: "Closed" };
const STATUS_VARIANTS: Record<FormStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  published: "default",
  closed: "secondary",
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

function ShareLinkCard({ slug, title, siteUrl, status }: { slug: string; title: string; siteUrl: string; status: FormStatus }) {
  const [copied, setCopied] = useState(false);
  const link = `${siteUrl}/forms/${slug}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link2 className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Share link</p>
            <p className="truncate text-xs text-muted-foreground">{link}</p>
            {status !== "published" && (
              <p className="text-xs text-destructive">Publish this form before sharing — it won&apos;t accept responses until then.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <QrCodeDialog link={link} title={title} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
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

function ResponseCard({ formId, response, fields, canDelete }: { formId: string; response: FormResponse; fields: FormField[]; canDelete: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs text-muted-foreground">{new Date(response.created_at).toLocaleString()}</p>
          {canDelete && (
            <form action={deleteFormResponse}>
              <input type="hidden" name="formId" value={formId} />
              <input type="hidden" name="responseId" value={response.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </form>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fields.map((field) => {
            const value = response.answers[field.key];
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

export function FormBuilder({
  form,
  responses,
  siteUrl,
  canWrite,
  canDelete,
}: {
  form: CustomForm;
  responses: FormResponse[];
  siteUrl: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description ?? "");
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [state, setState] = useState<FormMetaState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<Record<number, { label?: string; options?: string }>>({});
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

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
    // Re-derive each field's key from its label right before saving (not
    // on every keystroke) so keys stay readable/predictable without
    // fighting the user's typing mid-edit.
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
      const result = await updateForm(state, formData);
      setState(result);
    });
  }

  function handleStatusChange(status: FormStatus) {
    startStatusTransition(async () => {
      const data = new FormData();
      data.set("formId", form.id);
      data.set("status", status);
      await setFormStatus(data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANTS[form.status]}>{STATUS_LABELS[form.status]}</Badge>
        {canWrite && (
          <div className="ml-auto flex items-center gap-2">
            {form.status !== "published" && (
              <Button type="button" size="sm" variant="outline" disabled={statusPending} onClick={() => handleStatusChange("published")}>
                Publish
              </Button>
            )}
            {form.status === "published" && (
              <Button type="button" size="sm" variant="outline" disabled={statusPending} onClick={() => handleStatusChange("closed")}>
                Close (stop accepting responses)
              </Button>
            )}
            {form.status === "closed" && (
              <Button type="button" size="sm" variant="outline" disabled={statusPending} onClick={() => handleStatusChange("draft")}>
                Move back to draft
              </Button>
            )}
          </div>
        )}
      </div>

      <ShareLinkCard slug={form.slug} title={form.title} siteUrl={siteUrl} status={form.status} />

      <Tabs defaultValue="builder">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="builder">Builder</TabsTab>
          <TabsTab value="responses">Responses ({responses.length})</TabsTab>
        </TabsList>

        <TabsPanel value="builder">
          <form action={handleSubmit} className="space-y-6">
            <input type="hidden" name="formId" value={form.id} />
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canWrite}
                  aria-invalid={Boolean(state.fieldErrors?.title)}
                />
                <FieldError id="title-error" message={state.fieldErrors?.title} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
              </div>
            </div>

            <div className="space-y-3">
              {fields.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No fields yet. {canWrite && 'Click "Add field" below to start building.'}
                  </CardContent>
                </Card>
              ) : (
                fields.map((field, index) => (
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
                ))
              )}
            </div>

            {canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={addField}>
                  <Plus className="size-4" />
                  Add field
                </Button>
                <Button type="submit" disabled={pending}>
                  <Save className="size-4" />
                  {pending ? "Saving..." : "Save changes"}
                </Button>
              </div>
            )}
          </form>
        </TabsPanel>

        <TabsPanel value="responses">
          {responses.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No responses yet. Share the link above once this form is published.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {responses.map((response) => (
                <ResponseCard key={response.id} formId={form.id} response={response} fields={form.fields} canDelete={canDelete} />
              ))}
            </div>
          )}
        </TabsPanel>
      </Tabs>
    </div>
  );
}
