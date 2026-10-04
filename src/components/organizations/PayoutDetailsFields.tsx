"use client";

import { useState } from "react";
import { PAYOUT_METHODS, PAYOUT_METHOD_LABELS, type PayoutDetailsErrors } from "@/lib/organizations/payout-details";
import type { PayoutMethod } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/auth/FieldError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface PayoutDetailsDefaultValues {
  payoutMethod?: PayoutMethod;
  upiId?: string | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
}

// Plain form-fields block, no action logic of its own — a parent <form>
// picks these up via its own FormData by `name`, same role FieldError
// plays elsewhere. Shared by the Fundraiser/Event "Request payout"
// dialogs and the standalone Billing-page settings card so there's one
// place this UI is defined, even though the backend actions that consume
// it (requestFundraiserPayout, requestEventPayout, savePayoutDetails)
// stay separate per this codebase's usual per-feature convention.
export function PayoutDetailsFields({
  defaultValues,
  errors,
  showSaveForFutureCheckbox = false,
}: {
  defaultValues?: PayoutDetailsDefaultValues;
  errors?: PayoutDetailsErrors;
  showSaveForFutureCheckbox?: boolean;
}) {
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>(defaultValues?.payoutMethod ?? "upi");

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>How should we send your payout?</Label>
        <input type="hidden" name="payoutMethod" value={payoutMethod} />
        <Select value={payoutMethod} onValueChange={(v) => setPayoutMethod((v ?? "upi") as PayoutMethod)}>
          <SelectTrigger className="w-full" aria-invalid={Boolean(errors?.payoutMethod)}>
            <SelectValue>{() => PAYOUT_METHOD_LABELS[payoutMethod]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAYOUT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {PAYOUT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="payoutMethod-error" message={errors?.payoutMethod} />
      </div>

      {payoutMethod === "upi" ? (
        <div className="space-y-1.5">
          <Label htmlFor="upiId">UPI ID</Label>
          <Input id="upiId" name="upiId" placeholder="yourchurch@upi" defaultValue={defaultValues?.upiId ?? ""} aria-invalid={Boolean(errors?.upiId)} />
          <FieldError id="upiId-error" message={errors?.upiId} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bankAccountHolder">Account holder name</Label>
            <Input
              id="bankAccountHolder"
              name="bankAccountHolder"
              defaultValue={defaultValues?.bankAccountHolder ?? ""}
              aria-invalid={Boolean(errors?.bankAccountHolder)}
            />
            <FieldError id="bankAccountHolder-error" message={errors?.bankAccountHolder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankAccountNumber">Account number</Label>
            <Input
              id="bankAccountNumber"
              name="bankAccountNumber"
              defaultValue={defaultValues?.bankAccountNumber ?? ""}
              aria-invalid={Boolean(errors?.bankAccountNumber)}
            />
            <FieldError id="bankAccountNumber-error" message={errors?.bankAccountNumber} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankIfsc">IFSC code</Label>
            <Input id="bankIfsc" name="bankIfsc" defaultValue={defaultValues?.bankIfsc ?? ""} aria-invalid={Boolean(errors?.bankIfsc)} />
            <FieldError id="bankIfsc-error" message={errors?.bankIfsc} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankName">Bank name</Label>
            <Input id="bankName" name="bankName" defaultValue={defaultValues?.bankName ?? ""} aria-invalid={Boolean(errors?.bankName)} />
            <FieldError id="bankName-error" message={errors?.bankName} />
          </div>
        </div>
      )}

      {showSaveForFutureCheckbox && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox name="saveForFuture" defaultChecked />
          Save these details for future payouts
        </label>
      )}
    </div>
  );
}

// Compact one-line summary shown in place of the full form once an org
// already has saved payout details — avoids re-prompting for the same
// information on every request.
export function payoutDetailsSummary(details: PayoutDetailsDefaultValues): string {
  if (details.payoutMethod === "bank_transfer") {
    const last4 = (details.bankAccountNumber ?? "").slice(-4);
    return `Bank transfer — ${details.bankAccountHolder} · ...${last4} · ${details.bankName}`;
  }
  return `UPI — ${details.upiId}`;
}
