"use client";

import { useActionState } from "react";
import { updatePassword, type ResetPasswordState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FieldError } from "@/components/auth/FieldError";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
          aria-describedby={state.errors?.password ? "password-error" : undefined}
        />
        <FieldError id="password-error" message={state.errors?.password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.confirmPassword)}
          aria-describedby={state.errors?.confirmPassword ? "confirmPassword-error" : undefined}
        />
        <FieldError id="confirmPassword-error" message={state.errors?.confirmPassword} />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Updating password..." : "Update password"}
      </Button>
    </form>
  );
}
