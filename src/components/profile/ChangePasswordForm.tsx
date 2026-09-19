"use client";

import { useActionState } from "react";
import { changePassword, type ChangePasswordState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FieldError } from "@/components/auth/FieldError";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.message && (
        <Alert variant={state.success ? "default" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.errors?.currentPassword)}
          aria-describedby={state.errors?.currentPassword ? "currentPassword-error" : undefined}
        />
        <FieldError id="currentPassword-error" message={state.errors?.currentPassword} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
          aria-describedby={state.errors?.password ? "password-error" : "password-hint"}
        />
        {!state.errors?.password && (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
          </p>
        )}
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

      <Button type="submit" disabled={pending}>
        {pending ? "Updating..." : "Change password"}
      </Button>
    </form>
  );
}
