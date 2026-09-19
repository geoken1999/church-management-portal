// Translates Supabase Auth error codes/messages into copy that is safe and
// friendly to show end users, so raw provider/database errors never leak.
export function getAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password you entered is incorrect.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email address before signing in. Check your inbox for the confirmation link.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (normalized.includes("password should be at least")) {
    return "Password does not meet the minimum security requirements.";
  }
  if (normalized.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (normalized.includes("network") || normalized.includes("fetch failed")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }

  return "Something went wrong. Please try again in a moment.";
}
