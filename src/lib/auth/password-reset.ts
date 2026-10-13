import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Sends the password-reset email for [email], if it has an account. Shared by the
// web's "Forgot password" form and the mobile app's. Never says whether the
// account exists, so it can't be used to find out who has one.
//
export async function sendPasswordResetLink(email: string): Promise<void> {
  const origin = getSiteUrl();

  // Generated (not sent) via the admin API rather than
  // supabase.auth.resetPasswordForEmail — that call has Supabase's own
  // hosted mailer send the email, using whatever Site URL is configured in
  // the Supabase dashboard's Auth settings rather than this app's own
  // getSiteUrl() resolution, which is what caused reset links to land on a
  // stale preview/deployment URL instead of production. generateLink
  // returns the ready-to-use link without emailing it, so redirectTo here
  // is the only thing that decides where it points, and the email itself
  // is sent by us via Resend (sendPasswordResetEmail) instead of Supabase.
  //
  // Points at /auth/recovery, NOT /auth/callback — a recovery link's
  // session arrives in the URL's hash fragment (#access_token=...), never
  // as the ?code= query param /auth/callback's Route Handler expects (that
  // shape is only ever sent for a PKCE code exchange, e.g. signup
  // confirmation). A hash fragment is never sent to the server at all, so
  // it has to be read and exchanged client-side — see
  // src/app/auth/recovery/page.tsx and src/components/auth/
  // RecoveryHashHandler.tsx.
  //
  // Also requires this exact URL (or a matching wildcard) to be registered
  // under Authentication -> URL Configuration -> Redirect URLs in the
  // Supabase dashboard — otherwise Supabase silently ignores redirectTo
  // and falls back to the dashboard's configured Site URL instead (with
  // the hash still appended), which src/app/page.tsx's RecoveryHashRedirect
  // exists specifically to catch as a fallback.
  //
  // Errors are intentionally not surfaced in detail — returning the same
  // generic message regardless of outcome (including "no such user", which
  // generateLink does report) avoids leaking which emails have an account.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/recovery` },
  });

  if (error) {
    if (error.code !== "user_not_found") {
      await logPlatformEvent({
        level: "warning",
        source: "email_send",
        message: `Password reset link generation failed: ${error.message}`,
      });
    }
    return;
  }

  await sendPasswordResetEmail(email, data.properties.action_link);
}
