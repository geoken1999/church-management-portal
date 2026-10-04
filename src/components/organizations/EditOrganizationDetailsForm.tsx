"use client";

import { useActionState, useState } from "react";
import {
  updateOrganizationDetails,
  type UpdateOrganizationDetailsState,
} from "@/lib/organizations/actions";
import { MEMBER_COUNT_OPTIONS } from "@/lib/organizations/validation";
import { getCountryOptions } from "@/lib/phone/countries";
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
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
  country: initialCountry,
  timezone: initialTimezone,
}: {
  organizationId: string;
  memberCountRange: MemberCountRange | null;
  branchCount: number | null;
  country: string | null;
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationDetails, initialState);
  const [memberCountRange, setMemberCountRange] = useState(initialMemberCountRange ?? "");
  const [country, setCountry] = useState(initialCountry ?? "");
  const [timezone, setTimezone] = useState(initialTimezone || DEFAULT_TIMEZONE);
  // Controlled (not defaultValue) for the same reason as the two fields
  // above: after a successful save, revalidatePath() causes this
  // already-mounted form to receive a new `branchCount` prop from the
  // server, and an uncontrolled Input's defaultValue changing post-mount
  // is exactly what triggers Base UI's "uncontrolled FieldControl" warning.
  const [branchCount, setBranchCount] = useState(String(initialBranchCount ?? ""));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="memberCountRange" value={memberCountRange} />
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="timezone" value={timezone} />

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
          value={branchCount}
          onChange={(e) => setBranchCount(e.target.value)}
          placeholder="e.g. 1"
          aria-invalid={Boolean(state.fieldErrors?.branchCount)}
          aria-describedby={state.fieldErrors?.branchCount ? "branchCount-error" : undefined}
        />
        <FieldError id="branchCount-error" message={state.fieldErrors?.branchCount} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Select value={country} onValueChange={(value) => setCountry(value ?? "")}>
          <SelectTrigger id="country" className="w-full">
            <SelectValue placeholder="Select a country">
              {(value: string | null) =>
                getCountryOptions().find((o) => o.code === value)?.name ?? "Select a country"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {getCountryOptions().map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.name} (+{option.callingCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Used to interpret member phone numbers for SMS, for any branch that doesn&apos;t set its own country.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezoneSelect">Timezone</Label>
        <Select value={timezone} onValueChange={(value) => setTimezone(value ?? DEFAULT_TIMEZONE)}>
          <SelectTrigger id="timezoneSelect" className="w-full" aria-invalid={Boolean(state.fieldErrors?.timezone)}>
            <SelectValue placeholder="Select a timezone">
              {(value: string | null) => COMMON_TIMEZONES.find((tz) => tz.value === value)?.label ?? "Select a timezone"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="timezone-error" message={state.fieldErrors?.timezone} />
        <p className="text-xs text-muted-foreground">
          What &quot;7 PM&quot; means when scheduling an event — used for event times, reminder emails, and
          automation timing.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
