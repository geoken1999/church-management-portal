import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";

// A dedicated sender identity for this one email — kingdomflow.in is
// already verified with Resend (EMAIL_FROM_ADDRESS uses the same domain,
// see src/lib/email/env.ts), so this local part needs no extra setup. Kept
// separate from the shared "hello@" address so a password-reset email is
// immediately recognizable as such in an inbox, and so its own deliverability
// reputation (opens/clicks/spam reports) never mixes with bulk campaign mail.
const FROM_ADDRESS = "reset-password@kingdomflow.in";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Sent instead of letting Supabase Auth's own resetPasswordForEmail email
// the user directly — that path uses Supabase's own hosted mail sender
// and whatever Site URL is configured in the Supabase dashboard's Auth
// settings, not this app's own domain/branding or its own getSiteUrl()
// resolution (NEXT_PUBLIC_SITE_URL / VERCEL_PROJECT_PRODUCTION_URL — see
// src/lib/site-url.ts), which is what actually caused reset links to
// sometimes land on a stale preview/deployment URL instead of production.
// Generating the link ourselves (admin.auth.admin.generateLink in
// src/lib/auth/actions.ts) and emailing it via Resend fixes both: the
// link's redirectTo is entirely in our own control, and the email itself
// comes from our own sending domain.
export async function sendPasswordResetEmail(email: string, actionLink: string): Promise<void> {
  if (!isEmailConfigured()) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 16px; font-size: 18px;">Reset your password</h1>
        <p>We received a request to reset the password for your KingdomFlow account.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${escapeHtml(actionLink)}" style="display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Reset password
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">This link expires shortly and can only be used once.</p>
      </div>
    </div>
  `;

  try {
    await sendBulkEmail({
      fromName: "KingdomFlow",
      fromAddress: FROM_ADDRESS,
      subject: "Reset your KingdomFlow password",
      html,
      recipients: [email],
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Password reset email failed: ${err instanceof Error ? err.message : "unknown error"}`,
      metadata: { to: email },
    });
  }
}
