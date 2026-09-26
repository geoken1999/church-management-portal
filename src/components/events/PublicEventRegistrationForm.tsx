"use client";

import { useActionState } from "react";
import { registerForEvent, type PublicEventRegistrationState } from "@/lib/events/public-registration-actions";
import type { FormField } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Send } from "lucide-react";

const initialState: PublicEventRegistrationState = {};

function FieldLabel({ field }: { field: FormField }) {
  return (
    <Label htmlFor={`field-${field.key}`} className="text-sm font-medium">
      {field.label}
      {field.required && <span className="text-destructive"> *</span>}
    </Label>
  );
}

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
        <Textarea id={id} name={field.key} required={field.required} rows={3} className="rounded-xl px-3.5 py-3 text-base shadow-sm" />
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
      <Input id={id} name={field.key} type={inputType} required={field.required} className="h-11 rounded-xl px-3.5 text-base shadow-sm" />
    </div>
  );
}

export function PublicEventRegistrationForm({ token, fields }: { token: string; fields: FormField[] }) {
  const registerWithToken = registerForEvent.bind(null, token);
  const [state, formAction, pending] = useActionState(registerWithToken, initialState);

  const checkboxKeys = fields.filter((f) => f.field_type === "checkbox").map((f) => f.key);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-9 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-heading text-lg font-bold">You&apos;re registered!</p>
          <p className="text-sm text-muted-foreground">Check your email for your registration pass and QR code.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="__fieldKeys" value={fields.map((f) => f.key).join(",")} />
      <input type="hidden" name="__checkboxKeys" value={checkboxKeys.join(",")} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-4">
        {fields.map((field) => (
          <PublicFieldInput key={field.key} field={field} />
        ))}
      </div>
      <Button type="submit" size="lg" className="w-full rounded-xl shadow-sm" disabled={pending}>
        {pending ? (
          "Registering..."
        ) : (
          <>
            Register
            <Send className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
