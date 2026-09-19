"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signup, type SignupState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FieldError } from "@/components/auth/FieldError";

const initialState: SignupState = {};

export function SignupForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.success) {
    return (
      <Alert>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="next" value={next} />
      {state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
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
            autoComplete="family-name"
            required
            aria-invalid={Boolean(state.errors?.lastName)}
            aria-describedby={state.errors?.lastName ? "lastName-error" : undefined}
          />
          <FieldError id="lastName-error" message={state.errors?.lastName} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          aria-invalid={Boolean(state.errors?.email)}
          aria-describedby={state.errors?.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={state.errors?.email} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+1 555 000 1234"
          aria-invalid={Boolean(state.errors?.phone)}
          aria-describedby={state.errors?.phone ? "phone-error" : undefined}
        />
        <FieldError id="phone-error" message={state.errors?.phone} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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
        <Label htmlFor="confirmPassword">Confirm password</Label>
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
        {pending ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
