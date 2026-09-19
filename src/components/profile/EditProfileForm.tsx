"use client";

import { useActionState } from "react";
import { updateProfileDetails, type UpdateProfileState } from "@/lib/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";

const initialState: UpdateProfileState = {};

export function EditProfileForm({
  firstName,
  lastName,
  phone,
}: {
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfileDetails, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.message && (
        <Alert variant={state.success ? "default" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={firstName}
            required
            aria-invalid={Boolean(state.errors?.firstName)}
            aria-describedby={state.errors?.firstName ? "firstName-error" : undefined}
          />
          <FieldError id="firstName-error" message={state.errors?.firstName} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={lastName}
            required
            aria-invalid={Boolean(state.errors?.lastName)}
            aria-describedby={state.errors?.lastName ? "lastName-error" : undefined}
          />
          <FieldError id="lastName-error" message={state.errors?.lastName} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          placeholder="+1 555 000 1234"
          aria-invalid={Boolean(state.errors?.phone)}
          aria-describedby={state.errors?.phone ? "phone-error" : undefined}
        />
        <FieldError id="phone-error" message={state.errors?.phone} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
