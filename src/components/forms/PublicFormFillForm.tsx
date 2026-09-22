"use client";

import { useActionState } from "react";
import { submitPublicForm, type PublicFormState } from "@/lib/forms/public-actions";
import type { FormField, FormFieldType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  Send,
  Type,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  CalendarDays,
  ListChecks,
  SquareCheck,
} from "lucide-react";

const initialState: PublicFormState = {};

const FIELD_ICONS: Record<FormFieldType, typeof Type> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  email: Mail,
  phone: Phone,
  date: CalendarDays,
  checkbox: SquareCheck,
  select: ListChecks,
};

// Short-answer types sit two-per-row on wider screens to make use of the
// card's width; anything that needs more room to be readable/usable
// (long text, a list of options, a checkbox's full label) stays full-width.
const COMPACT_FIELD_TYPES: FormFieldType[] = ["text", "email", "phone", "number", "date"];

function FieldLabel({ field }: { field: FormField }) {
  const Icon = FIELD_ICONS[field.field_type];
  return (
    <Label htmlFor={`field-${field.key}`} className="flex items-center gap-1.5 text-sm font-medium">
      <Icon className="size-3.5 text-primary" />
      {field.label}
      {field.required && <span className="text-destructive">*</span>}
    </Label>
  );
}

const fieldInputClassName = "h-11 rounded-xl px-3.5 text-base shadow-sm";

function PublicFieldInput({ field }: { field: FormField }) {
  const id = `field-${field.key}`;

  if (field.field_type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm transition-colors hover:bg-muted/60">
        <Checkbox name={field.key} required={field.required} className="mt-0.5" />
        <span>
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </span>
      </label>
    );
  }

  if (field.field_type === "select") {
    return (
      <div className="space-y-2">
        <FieldLabel field={field} />
        <Select name={field.key}>
          <SelectTrigger id={id} className="h-11 w-full rounded-xl px-3.5 text-base shadow-sm">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <div className="space-y-2">
        <FieldLabel field={field} />
        <Textarea id={id} name={field.key} required={field.required} rows={4} className="rounded-xl px-3.5 py-3 text-base shadow-sm" />
      </div>
    );
  }

  const inputType =
    field.field_type === "number"
      ? "number"
      : field.field_type === "date"
        ? "date"
        : field.field_type === "email"
          ? "email"
          : field.field_type === "phone"
            ? "tel"
            : "text";

  return (
    <div className="space-y-2">
      <FieldLabel field={field} />
      <Input id={id} name={field.key} type={inputType} required={field.required} className={fieldInputClassName} />
    </div>
  );
}

export function PublicFormFillForm({ slug, fields }: { slug: string; fields: FormField[] }) {
  const submitWithSlug = submitPublicForm.bind(null, slug);
  const [state, formAction, pending] = useActionState(submitWithSlug, initialState);

  const checkboxKeys = fields.filter((f) => f.field_type === "checkbox").map((f) => f.key);
  const estimatedMinutes = Math.max(1, Math.ceil(fields.length / 3));

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-9 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-heading text-lg font-bold">You&apos;re all set!</p>
          <p className="text-sm text-muted-foreground">Your response was submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="__fieldKeys" value={fields.map((f) => f.key).join(",")} />
      <input type="hidden" name="__checkboxKeys" value={checkboxKeys.join(",")} />
      {fields.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {fields.length} {fields.length === 1 ? "question" : "questions"} · about {estimatedMinutes}{" "}
          {estimatedMinutes === 1 ? "minute" : "minutes"}
        </p>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className={COMPACT_FIELD_TYPES.includes(field.field_type) ? undefined : "sm:col-span-2"}>
            <PublicFieldInput field={field} />
          </div>
        ))}
      </div>
      <Button type="submit" size="lg" className="w-full rounded-xl shadow-sm" disabled={pending}>
        {pending ? (
          "Submitting..."
        ) : (
          <>
            Submit
            <Send className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
