"use client";

import { useActionState, useState } from "react";
import { updateProfileDetails, type UpdateProfileState } from "@/lib/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";

const initialState: UpdateProfileState = {};

export function EditProfileForm({
  firstName: initialFirstName,
  lastName: initialLastName,
  phone: initialPhone,
}: {
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfileDetails, initialState);
  // Controlled rather than defaultValue — after a successful save,
  // revalidatePath() causes this already-mounted form to receive new
  // firstName/lastName/phone props from the server, and an uncontrolled
  // Input's defaultValue changing post-mount is exactly what triggers
  // Base UI's "uncontrolled FieldControl" warning.
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initialPhone);

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
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
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
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
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
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
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
