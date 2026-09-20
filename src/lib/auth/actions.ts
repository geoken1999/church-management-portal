"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { getSiteUrl } from "@/lib/site-url";
import {
  validateLogin,
  validatePassword,
  validateSignup,
  hasErrors,
  type LoginFieldErrors,
  type SignupFieldErrors,
} from "@/lib/auth/validation";

export interface SignupState {
  errors?: SignupFieldErrors;
  message?: string;
  success?: boolean;
}

export interface LoginState {
  errors?: LoginFieldErrors;
  message?: string;
}

export interface ForgotPasswordState {
  errors?: { email?: string };
  success?: boolean;
  message?: string;
}

export interface ResetPasswordState {
  errors?: { password?: string; confirmPassword?: string };
  message?: string;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const firstName = readString(formData, "firstName");
  const lastName = readString(formData, "lastName");
  const email = readString(formData, "email").trim().toLowerCase();
  const phone = readString(formData, "phone").trim();
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");
  const next = readString(formData, "next");
  const redirectTarget = next && next.startsWith("/") ? next : "/onboarding";

  const errors = validateSignup({ firstName, lastName, email, phone, password, confirmPassword });
  if (hasErrors(errors)) {
    return { errors };
  }

  const supabase = await createClient();
  const origin = getSiteUrl();
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", redirectTarget);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone || null,
      },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { message: getAuthErrorMessage(error) };
  }

  // Supabase returns a session immediately when email confirmations are
  // disabled for the project. Otherwise the user must confirm via email
  // before a session exists. Either way, a brand-new user with no `next`
  // (e.g. an invite link) has no organization yet, so they land in
  // onboarding rather than the dashboard.
  if (data.session) {
    redirect(redirectTarget);
  }

  return {
    success: true,
    message:
      "Account created. Check your email to confirm your address, then sign in.",
  };
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = readString(formData, "email").trim().toLowerCase();
  const password = readString(formData, "password");
  const next = readString(formData, "next");

  const errors = validateLogin({ email, password });
  if (hasErrors(errors)) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { message: getAuthErrorMessage(error) };
  }

  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password.";

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = readString(formData, "email").trim().toLowerCase();

  if (!email) {
    return { errors: { email: "Email is required." } };
  }

  const supabase = await createClient();
  const origin = getSiteUrl();

  // Errors are intentionally not surfaced in detail — returning the same
  // generic message regardless of outcome avoids leaking which emails have
  // an account.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return { success: true, message: GENERIC_RESET_MESSAGE };
}

export async function updatePassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  const errors: ResetPasswordState["errors"] = {};
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";

  if (hasErrors(errors)) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { message: getAuthErrorMessage(error) };
  }

  redirect("/dashboard");
}

export interface ChangePasswordState {
  errors?: { currentPassword?: string; password?: string; confirmPassword?: string };
  message?: string;
  success?: boolean;
}

// Same as updatePassword, but for a user changing their password from an
// already-authenticated settings page — verifies their current password
// first (Supabase's updateUser() trusts the active session and doesn't
// require it), and shows a success message in place rather than redirecting.
export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = readString(formData, "currentPassword");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  const errors: ChangePasswordState["errors"] = {};
  if (!currentPassword) errors.currentPassword = "Enter your current password.";
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";

  if (hasErrors(errors)) {
    return { errors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { message: "Your session has expired. Please sign in again." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return { errors: { currentPassword: "Current password is incorrect." } };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { message: getAuthErrorMessage(error) };
  }

  return { success: true, message: "Password updated." };
}
