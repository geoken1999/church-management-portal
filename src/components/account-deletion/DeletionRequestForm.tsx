"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  submitDeletionForm,
  type DeletionFormState,
} from "@/lib/account-deletion/form-actions";
import { RELATIONSHIPS, SCOPES } from "@/lib/account-deletion/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

const initialState: DeletionFormState = {};
const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function DeletionRequestForm() {
  const [state, formAction, pending] = useActionState(
    submitDeletionForm,
    initialState,
  );

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 py-10 text-center">
        <CheckCircle2 className="size-9 text-primary" />
        <div className="max-w-sm">
          <p className="font-heading text-lg font-bold">Check your email</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ve sent a link to confirm it&apos;s you. Open it within 72
            hours and your request goes to our team. If nothing arrives, check
            your spam folder.
          </p>
        </div>
      </div>
    );
  }

  const e = state.errors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <ErrorToast message={state.error} />
      {/* A field only automated form-fillers see. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="del-name">Full name</Label>
          <Input id="del-name" name="name" aria-invalid={Boolean(e.name)} />
          <FieldError id="del-name-error" message={e.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="del-email">Email</Label>
          <Input
            id="del-email"
            name="email"
            type="email"
            aria-invalid={Boolean(e.email)}
          />
          <FieldError id="del-email-error" message={e.email} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="del-phone">Phone (optional)</Label>
          <Input
            id="del-phone"
            name="phone"
            type="tel"
            placeholder="The number you signed in with"
            aria-invalid={Boolean(e.phone)}
          />
          <FieldError id="del-phone-error" message={e.phone} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="del-church">Church (optional)</Label>
          <Input
            id="del-church"
            name="churchName"
            aria-invalid={Boolean(e.churchName)}
          />
          <FieldError id="del-church-error" message={e.churchName} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="del-relationship">
          How are you connected to KingdomFlow?
        </Label>
        <select
          id="del-relationship"
          name="relationship"
          defaultValue=""
          className={SELECT_CLASS}
        >
          <option value="" disabled>
            Choose one
          </option>
          {RELATIONSHIPS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <FieldError id="del-relationship-error" message={e.relationship} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What should we delete?</legend>
        {SCOPES.map((s, i) => (
          <label key={s.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              value={s.value}
              defaultChecked={i === 0}
              className="mt-1"
            />
            {s.label}
          </label>
        ))}
        <FieldError id="del-scope-error" message={e.scope} />
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="del-details">Anything we should know (optional)</Label>
        <Textarea
          id="del-details"
          name="details"
          rows={4}
          maxLength={1000}
          aria-invalid={Boolean(e.details)}
        />
        <FieldError id="del-details-error" message={e.details} />
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending..." : "Request deletion"}
      </Button>
    </form>
  );
}
