"use client";

import { useState } from "react";
import { gstBreakdown, formatRupees } from "@/lib/billing/gst";
import { INDIAN_STATES } from "@/lib/billing/states";
import {
  validateBillingDetails,
  type BillingDetailsErrors,
  type BillingDetailsInput,
} from "@/lib/billing/billing-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export interface CheckoutResult {
  error?: string;
  billingErrors?: BillingDetailsErrors;
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Asked for before paying: who the invoice is made out to, and what the total comes to with 18% GST.
// onSubmit does the checkout; when it works the page leaves for the payment page, so nothing more happens here.
export function BillingDetailsDialog({
  open,
  onOpenChange,
  title,
  basePrice,
  sellerState,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  basePrice: number;
  sellerState: string;
  initial: BillingDetailsInput;
  onSubmit: (details: BillingDetailsInput) => Promise<CheckoutResult>;
}) {
  const [form, setForm] = useState<BillingDetailsInput>(initial);
  const [errors, setErrors] = useState<BillingDetailsErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set =
    (key: keyof BillingDetailsInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const tax = gstBreakdown(basePrice, form.state, sellerState);

  async function submit() {
    setServerError(null);
    const found = validateBillingDetails(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    const result = await onSubmit(form);
    // Reaching here means it didn't go through (a successful checkout leaves the page).
    setPending(false);
    if (result.billingErrors) setErrors(result.billingErrors);
    if (result.error) setServerError(result.error);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Your invoice is made out to these details and emailed to the address
            below. GST is added to the price.
          </DialogDescription>
        </DialogHeader>
        <ErrorToast message={serverError} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="bd-name"
              label="Name on the invoice"
              error={errors.legalName}
            >
              <Input
                id="bd-name"
                value={form.legalName}
                onChange={set("legalName")}
                placeholder="Grace Church Trust"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="bd-gstin" label="GSTIN (optional)" error={errors.gstin}>
              <Input
                id="bd-gstin"
                value={form.gstin}
                onChange={set("gstin")}
                placeholder="27ABCDE1234F1Z5"
                maxLength={15}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="bd-a1" label="Address" error={errors.addressLine1}>
              <Input
                id="bd-a1"
                value={form.addressLine1}
                onChange={set("addressLine1")}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              id="bd-a2"
              label="Address line 2 (optional)"
              error={errors.addressLine2}
            >
              <Input
                id="bd-a2"
                value={form.addressLine2}
                onChange={set("addressLine2")}
              />
            </Field>
          </div>
          <Field id="bd-city" label="City" error={errors.city}>
            <Input id="bd-city" value={form.city} onChange={set("city")} />
          </Field>
          <Field id="bd-pin" label="PIN code" error={errors.pincode}>
            <Input
              id="bd-pin"
              value={form.pincode}
              onChange={set("pincode")}
              inputMode="numeric"
              maxLength={6}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="bd-state" label="State" error={errors.state}>
              <select
                id="bd-state"
                className={SELECT_CLASS}
                value={form.state}
                onChange={set("state")}
              >
                <option value="">Choose a state…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            id="bd-email"
            label="Email for the invoice"
            error={errors.email}
          >
            <Input
              id="bd-email"
              type="email"
              value={form.email}
              onChange={set("email")}
            />
          </Field>
          <Field id="bd-phone" label="Phone (optional)" error={errors.phone}>
            <Input id="bd-phone" value={form.phone} onChange={set("phone")} />
          </Field>
        </div>

        <dl className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Price</dt>
            <dd>{formatRupees(tax.base)}</dd>
          </div>
          {form.state && tax.intraState ? (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">CGST (9%)</dt>
                <dd>{formatRupees(tax.cgst)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">SGST (9%)</dt>
                <dd>{formatRupees(tax.sgst)}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {form.state ? "IGST (18%)" : "GST (18%)"}
              </dt>
              <dd>{formatRupees(tax.gst)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-medium">
            <dt>Total to pay</dt>
            <dd>{formatRupees(tax.total)}</dd>
          </div>
        </dl>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Starting payment…" : `Pay ${formatRupees(tax.total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
