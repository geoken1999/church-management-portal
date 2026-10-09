"use client";

import { useActionState, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  registerForEvent,
  deferEventRegistrationToCheckin,
  type PublicEventRegistrationState,
} from "@/lib/events/public-registration-actions";
import { EventRegistrationPayment } from "@/components/events/EventRegistrationPayment";
import { createEventRegistrationOrder } from "@/lib/events/payu-registration";
import { redirectToPayU } from "@/lib/payu/browser";
import { useLocale } from "@/lib/i18n/LocaleContext";
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
  const { t } = useLocale();
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
            <SelectValue placeholder={t.common.selectAnOption} />
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

// The external-gateway counterpart to EventRegistrationPayment's
// "pay at check-in instead" button — the platform-gateway version lives
// there since it shares state with the PayU checkout flow; this one
// has nothing else to share state with, so it's local to this file.
function DeferToCheckinButton({ registrationId, onDeferred }: { registrationId: string; onDeferred: () => void }) {
  const { t } = useLocale();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await deferEventRegistrationToCheckin(registrationId);
      onDeferred();
    });
  }

  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={handleClick}>
      {pending ? t.publicEvent.deferringToCheckin : t.publicEvent.payAtCheckinInstead}
    </Button>
  );
}

// Shown after PayU redirects the browser back here (see
// /api/payu/event-registration/return) — a full-page navigation, so the
// useActionState above has already reset to initialState by the time this
// mounts. payment/registrationId travel as plain query params rather than
// through state for exactly that reason.
function PaymentFailedCard({ registrationId }: { registrationId: string | null }) {
  const { t } = useLocale();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    if (!registrationId) return;
    setError(null);
    setRetrying(true);
    const result = await createEventRegistrationOrder(registrationId);
    if (result.error || !result.payuFields || !result.payuActionUrl) {
      setError(result.error ?? "Couldn't start the payment.");
      setRetrying(false);
      return;
    }
    redirectToPayU(result.payuActionUrl, result.payuFields);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
      <div className="space-y-1">
        <p className="font-heading text-lg font-bold">{t.publicEvent.paymentFailedTitle}</p>
        <p className="text-sm text-muted-foreground">{t.publicEvent.paymentFailedDescription}</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {registrationId && (
        <Button type="button" disabled={retrying} onClick={handleRetry}>
          {retrying ? t.publicEvent.processingPayment : t.publicEvent.retryPayment}
        </Button>
      )}
    </div>
  );
}

export function PublicEventRegistrationForm({ token, fields }: { token: string; fields: FormField[] }) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const registerWithToken = registerForEvent.bind(null, token);
  const [state, formAction, pending] = useActionState(registerWithToken, initialState);
  const [deferredToCheckin, setDeferredToCheckin] = useState(false);

  const checkboxKeys = fields.filter((f) => f.field_type === "checkbox").map((f) => f.key);

  // Checked before any state-driven branch below: a PayU return is a full
  // navigation, so state is always back to initialState here, even though
  // the registration genuinely was (or wasn't) paid for. The
  // state-driven paymentRequired/success branches below still apply to the
  // external-gateway path, which never navigates away from this page.
  const paymentResult = searchParams.get("payment");
  if (paymentResult === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-9 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-heading text-lg font-bold">{t.publicEvent.successTitle}</p>
          <p className="text-sm text-muted-foreground">{t.publicEvent.successDescription}</p>
        </div>
      </div>
    );
  }
  if (paymentResult === "failed") {
    return <PaymentFailedCard registrationId={searchParams.get("registrationId")} />;
  }

  if (state.paymentRequired && state.registrationId) {
    const allowDefer = state.paymentTiming === "both";

    if (state.paymentGateway === "platform") {
      return (
        <EventRegistrationPayment
          registrationId={state.registrationId}
          amount={state.paymentAmount ?? 0}
          allowDeferToCheckin={allowDefer}
        />
      );
    }

    if (deferredToCheckin) {
      return (
        <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-9 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="font-heading text-lg font-bold">{t.publicEvent.deferredToCheckinTitle}</p>
            <p className="text-sm text-muted-foreground">{t.publicEvent.deferredToCheckinDescription(state.paymentAmount ?? 0)}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-9 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-heading text-lg font-bold">{t.publicEvent.registeredPaymentPendingTitle}</p>
          <p className="text-sm text-muted-foreground">{t.publicEvent.registeredPaymentPendingDescription}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {state.externalPaymentUrl && (
            <Button nativeButton={false} render={<a href={state.externalPaymentUrl} target="_blank" rel="noopener noreferrer" />}>
              {t.publicEvent.payNow(state.paymentAmount ?? 0)}
            </Button>
          )}
          {allowDefer && (
            <DeferToCheckinButton registrationId={state.registrationId} onDeferred={() => setDeferredToCheckin(true)} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t.publicEvent.externalPaymentNote}</p>
      </div>
    );
  }

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center duration-300 animate-in fade-in zoom-in-95">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-9 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-heading text-lg font-bold">{t.publicEvent.successTitle}</p>
          <p className="text-sm text-muted-foreground">{t.publicEvent.successDescription}</p>
        </div>
        {state.paymentAmount != null && (
          <p className="text-sm text-muted-foreground">
            {state.paymentGateway === "external" && state.externalPaymentUrl ? (
              <a href={state.externalPaymentUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {t.publicEvent.paymentDueAtCheckin(state.paymentAmount)}
              </a>
            ) : (
              t.publicEvent.paymentDueAtCheckin(state.paymentAmount)
            )}
          </p>
        )}
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
          t.publicEvent.registering
        ) : (
          <>
            {t.publicEvent.register}
            <Send className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
