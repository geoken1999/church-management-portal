"use server";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { validateContactForm, type ContactFieldErrors } from "@/lib/contact/validation";

const CONTACT_INBOX = "admin@kingdomflow.in";

export interface ContactFormState {
  error?: string;
  fieldErrors?: ContactFieldErrors;
  success?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Anonymous, unauthenticated submission from the public /contact page — no
// requireUser(), same trust boundary as submitPublicForm/submitMemberRequest:
// the submitter's own text is escaped before going into the email body, and
// replyTo is set to their address so admin@ can just hit reply rather than
// copy it out of the body.
export async function submitContactForm(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const fieldErrors = validateContactForm({ name, email, message });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  if (!isEmailConfigured()) {
    return { error: "Sorry, the contact form isn't available right now. Please email us directly instead." };
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin: 0 0 12px;">New contact form message</h2>
      <p style="margin: 0 0 4px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${subject ? `<p style="margin: 0 0 4px;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>` : ""}
      <p style="margin: 16px 0 4px;"><strong>Message:</strong></p>
      <p style="white-space: pre-wrap; margin: 0;">${escapeHtml(message)}</p>
    </div>
  `;

  const result = await sendBulkEmail({
    fromName: "KingdomFlow Contact Form",
    subject: subject ? `Contact form: ${subject}` : `Contact form message from ${name}`,
    html,
    recipients: [CONTACT_INBOX],
    replyTo: email,
  });

  if (result.failed.length > 0) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Contact form email failed to send: ${result.failed[0]?.error ?? "unknown error"}`,
      metadata: { name, email },
    });
    return { error: "Couldn't send your message. Please try again or email us directly." };
  }

  return { success: true };
}
