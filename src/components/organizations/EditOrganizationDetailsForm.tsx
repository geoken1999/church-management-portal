"use client";

import { useActionState, useState } from "react";
import {
  updateOrganizationDetails,
  type UpdateOrganizationDetailsState,
} from "@/lib/organizations/actions";
import { MEMBER_COUNT_OPTIONS } from "@/lib/organizations/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MemberCountRange } from "@/types/database";

const initialState: UpdateOrganizationDetailsState = {};

export function EditOrganizationDetailsForm({
  organizationId,
  memberCountRange: initialMemberCountRange,
  branchCount: initialBranchCount,
}: {
  organizationId: string;
  memberCountRange: MemberCountRange | null;
  branchCount: number | null;
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationDetails, initialState);
  const [memberCountRange, setMemberCountRange] = useState(initialMemberCountRange ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="memberCountRange" value={memberCountRange} />

      {state.success && (
        <Alert>
          <AlertDescription>Church details updated.</AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="memberCountRange">Congregation size</Label>
        <Select value={memberCountRange} onValueChange={(value) => setMemberCountRange(value ?? "")}>
          <SelectTrigger
            id="memberCountRange"
            className="w-full"
            aria-invalid={Boolean(state.fieldErrors?.memberCountRange)}
          >
            <SelectValue placeholder="Select a range">
              {(value: string | null) =>
                MEMBER_COUNT_OPTIONS.find((o) => o.value === value)?.label ?? "Select a range"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MEMBER_COUNT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="memberCountRange-error" message={state.fieldErrors?.memberCountRange} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="branchCount">Locations</Label>
        <Input
          id="branchCount"
          name="branchCount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          defaultValue={initialBranchCount ?? undefined}
          placeholder="e.g. 1"
          aria-invalid={Boolean(state.fieldErrors?.branchCount)}
          aria-describedby={state.fieldErrors?.branchCount ? "branchCount-error" : undefined}
        />
        <FieldError id="branchCount-error" message={state.fieldErrors?.branchCount} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
