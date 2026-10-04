"use server";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { validateCustomPlanRequest, type CustomPlanRequestFieldErrors } from "@/lib/custom-plan/validation";

// Same inbox as the /contact page (src/lib/contact/actions.ts) — one
// shared place the team already watches, rather than a second inbox to
// remember to check.
const CONTACT_INBOX = "admin@kingdomflow.in";

export interface CustomPlanRequestState {
  error?: string;
  fieldErrors?: CustomPlanRequestFieldErrors;
  success?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Anonymous, unauthenticated submission from the landing page's Custom
// plan dialog — same trust boundary and shape as submitContactForm
// (src/lib/contact/actions.ts): no requireUser(), the submitter's own
// text is escaped before going into the email body, and replyTo is set
// to their address so admin@ can just hit reply. Deliberately no DB
// table behind this — the plan itself is "completely manual," so an
// email the team acts on directly is the whole mechanism, not a queue to
// build a review UI for.
export async function submitCustomPlanRequest(
  _prevState: CustomPlanRequestState,
  formData: FormData,
): Promise<CustomPlanRequestState> {
  const churchName = String(formData.get("churchName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const fieldErrors = validateCustomPlanRequest({ churchName, email, phone });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  if (!isEmailConfigured()) {
    return { error: "Sorry, this form isn't available right now. Please email us directly instead." };
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin: 0 0 12px;">New Custom plan request</h2>
      <p style="margin: 0 0 4px;"><strong>Church:</strong> ${escapeHtml(churchName)}</p>
      <p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="margin: 0 0 4px;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>
      <p style="margin: 16px 0 0; color: #666;">Submitted from the landing page pricing section.</p>
    </div>
  `;

  const result = await sendBulkEmail({
    fromName: "KingdomFlow Custom Plan Request",
    subject: `Custom plan request — ${churchName}`,
    html,
    recipients: [CONTACT_INBOX],
    replyTo: email,
  });

  if (result.failed.length > 0) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Custom plan request email failed to send: ${result.failed[0]?.error ?? "unknown error"}`,
      metadata: { churchName, email, phone },
    });
    return { error: "Couldn't send your request. Please try again or email us directly." };
  }

  return { success: true };
}
