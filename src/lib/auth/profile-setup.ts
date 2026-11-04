import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Sent from the team's own address, so a person invited to a church sees who it is from and can reply to it.
const FROM_ADDRESS = "teams@kingdomflow.in";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Emails a new team member a link to set up their profile (choose their own password), instead of the church
 * sharing a generated one. The link is a Supabase recovery link pointed at /auth/recovery, the same page the
 * forgot-password email uses, so it expires with the project's email link lifetime; they can always ask for a
 * new one from "Forgot password". Returns false if it could not be sent, so the caller can fall back.
 */
export async function sendProfileSetupLink(email: string, firstName: string, organizationName: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${getSiteUrl()}/auth/recovery` },
    });
    if (error || !data.properties?.action_link) throw new Error(error?.message ?? "No link was generated.");

    const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 16px; font-size: 18px;">Set up your KingdomFlow profile</h1>
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>You've been added to the team at <strong>${escapeHtml(organizationName)}</strong> on KingdomFlow. Choose a password to finish setting up your profile, then sign in with this email address.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${escapeHtml(data.properties.action_link)}" style="display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Set up my profile
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">If the link has expired, open the KingdomFlow sign-in page and choose "Forgot password" to get a new one.</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">If you weren't expecting this, you can ignore this email.</p>
      </div>
    </div>
  `;
    const result = await sendBulkEmail({
      fromName: "KingdomFlow Teams",
      fromAddress: FROM_ADDRESS,
      subject: `Set up your KingdomFlow profile for ${organizationName}`,
      html,
      recipients: [email],
    });
    if (result.sentCount < 1) throw new Error(result.failed[0]?.error ?? "The email was not sent.");
    return true;
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Profile setup email failed: ${err instanceof Error ? err.message : "unknown error"}`,
      metadata: { to: email },
    });
    return false;
  }
}
