"use client";

import { useActionState, useState } from "react";
import { submitMemberRequest, type PublicJoinFormState } from "@/lib/members/public-actions";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useBilingualLabel } from "@/lib/bilingual/use-bilingual";
import { bilingualText, type BilingualConfig } from "@/lib/bilingual/config";
import type { PublicFieldDefinition, Branch } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const initialState: PublicJoinFormState = {};

function PublicCustomFieldInput({ definition, bilingual }: { definition: PublicFieldDefinition; bilingual: BilingualConfig | null }) {
  const { t } = useLocale();
  const name = `custom_${definition.key}`;
  const id = `custom-${definition.key}`;

  if (definition.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name={name} required={definition.required} />
        {bilingualText(definition.label, bilingual)}
        {definition.required && <span className="text-destructive">*</span>}
      </label>
    );
  }

  if (definition.field_type === "select") {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>
          {bilingualText(definition.label, bilingual)}
          {definition.required && <span className="text-destructive">*</span>}
        </Label>
        <Select name={name}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={t.common.selectAnOption} />
          </SelectTrigger>
          <SelectContent>
            {(definition.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {bilingualText(option, bilingual)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {bilingualText(definition.label, bilingual)}
        {definition.required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        name={name}
        type={definition.field_type === "number" ? "number" : definition.field_type === "date" ? "date" : "text"}
        required={definition.required}
      />
    </div>
  );
}

export function PublicJoinForm({
  orgSlug,
  fieldDefinitions,
  branches,
  bilingual = null,
}: {
  orgSlug: string;
  fieldDefinitions: PublicFieldDefinition[];
  branches: Pick<Branch, "id" | "name">[];
  bilingual?: BilingualConfig | null;
}) {
  const { t } = useLocale();
  const bt = useBilingualLabel(bilingual);
  const boundAction = submitMemberRequest.bind(null, orgSlug);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [maritalStatus, setMaritalStatus] = useState("");

  if (state.success) {
    return (
      <Alert>
        <AlertDescription>{t.publicJoin.successMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="__fieldKeys" value={fieldDefinitions.map((f) => f.key).join(",")} />
      <input type="hidden" name="__branchCount" value={branches.length} />

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">
            {bt((d) => d.publicJoin.firstName)} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="firstName"
            name="firstName"
            required
            aria-invalid={Boolean(state.fieldErrors?.firstName)}
            aria-describedby={state.fieldErrors?.firstName ? "firstName-error" : undefined}
          />
          <FieldError id="firstName-error" message={state.fieldErrors?.firstName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">
            {bt((d) => d.publicJoin.lastName)} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="lastName"
            name="lastName"
            required
            aria-invalid={Boolean(state.fieldErrors?.lastName)}
            aria-describedby={state.fieldErrors?.lastName ? "lastName-error" : undefined}
          />
          <FieldError id="lastName-error" message={state.fieldErrors?.lastName} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{bt((d) => d.publicJoin.email)}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          {bt((d) => d.publicJoin.phone)} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          aria-invalid={Boolean(state.fieldErrors?.phone)}
          aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined}
        />
        <FieldError id="phone-error" message={state.fieldErrors?.phone} />
      </div>

      {branches.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="branchId">
            {bt((d) => d.publicJoin.branch)} <span className="text-destructive">*</span>
          </Label>
          <Select name="branchId" required aria-invalid={Boolean(state.fieldErrors?.branchId)}>
            <SelectTrigger
              id="branchId"
              className="w-full"
              aria-describedby={state.fieldErrors?.branchId ? "branchId-error" : undefined}
            >
              <SelectValue placeholder={t.publicJoin.selectABranch}>
                {(value: string | null) => branches.find((b) => b.id === value)?.name ?? t.publicJoin.selectABranch}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="branchId-error" message={state.fieldErrors?.branchId} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">
            {bt((d) => d.publicJoin.dateOfBirth)} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            required
            aria-invalid={Boolean(state.fieldErrors?.dateOfBirth)}
            aria-describedby={state.fieldErrors?.dateOfBirth ? "dateOfBirth-error" : undefined}
          />
          <FieldError id="dateOfBirth-error" message={state.fieldErrors?.dateOfBirth} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maritalStatus">
            {bt((d) => d.publicJoin.maritalStatus)} <span className="text-destructive">*</span>
          </Label>
          <input type="hidden" name="maritalStatus" value={maritalStatus} />
          <Select value={maritalStatus} onValueChange={(v) => setMaritalStatus(v ?? "")}>
            <SelectTrigger
              id="maritalStatus"
              className="w-full"
              aria-invalid={Boolean(state.fieldErrors?.maritalStatus)}
            >
              <SelectValue placeholder={t.common.select}>
                {(value: string | null) =>
                  value === "married" ? bt((d) => d.publicJoin.married) : value === "unmarried" ? bt((d) => d.publicJoin.unmarried) : t.common.select
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="married">{bt((d) => d.publicJoin.married)}</SelectItem>
              <SelectItem value="unmarried">{bt((d) => d.publicJoin.unmarried)}</SelectItem>
            </SelectContent>
          </Select>
          <FieldError id="maritalStatus-error" message={state.fieldErrors?.maritalStatus} />
        </div>
      </div>

      {maritalStatus === "married" && (
        <div className="space-y-2">
          <Label htmlFor="weddingDate">
            {bt((d) => d.publicJoin.weddingDate)} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="weddingDate"
            name="weddingDate"
            type="date"
            required
            aria-invalid={Boolean(state.fieldErrors?.weddingDate)}
            aria-describedby={state.fieldErrors?.weddingDate ? "weddingDate-error" : undefined}
          />
          <FieldError id="weddingDate-error" message={state.fieldErrors?.weddingDate} />
        </div>
      )}

      {fieldDefinitions.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          {fieldDefinitions.map((def) => (
            <PublicCustomFieldInput key={def.key} definition={def} bilingual={bilingual} />
          ))}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.common.submitting : bt((d) => d.publicJoin.submitRequest)}
      </Button>
    </form>
  );
}
