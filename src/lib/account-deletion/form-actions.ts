"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { checkAttemptLimit, recordAttempt } from "@/lib/auth/rate-limit";
import { DELETION_FORM_RULE } from "@/lib/auth/rate-limit-rules";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import {
  TOKEN_HOURS,
  validateDeletionForm,
  type DeletionFormErrors,
} from "@/lib/account-deletion/form";

const INBOX = "admin@kingdomflow.in";

export interface DeletionFormState {
  errors?: DeletionFormErrors;
  error?: string;
  success?: boolean;
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function read(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

// Public: someone who can't use the app asks for their account to be deleted. They must confirm
// from a link sent to their email first, so nobody can file a request in someone else's name.
// The reply is the same whether or not a request already exists.
export async function submitDeletionForm(
  _prev: DeletionFormState,
  formData: FormData,
): Promise<DeletionFormState> {
  // A hidden field real people never fill in.
  if (read(formData, "website")) return { success: true };

  const input = {
    name: read(formData, "name").trim(),
    email: read(formData, "email").trim().toLowerCase(),
    phone: read(formData, "phone").trim(),
    churchName: read(formData, "churchName").trim(),
    relationship: read(formData, "relationship"),
    scope: read(formData, "scope"),
    details: read(formData, "details").trim(),
  };
  const errors = validateDeletionForm(input);
  if (Object.keys(errors).length > 0) return { errors };

  if (!isEmailConfigured())
    return {
      error:
        "This form isn't available right now. Please email admin@kingdomflow.in instead.",
    };

  const limited = await checkAttemptLimit(DELETION_FORM_RULE, input.email);
  if (limited) return { error: limited };
  await recordAttempt(DELETION_FORM_RULE, input.email);

  const admin = createAdminClient();
  const { data: open } = await admin
    .from("deletion_form_requests")
    .select("id, status")
    .ilike("email", input.email)
    .in("status", ["unverified", "pending"])
    .maybeSingle();
  if (open?.status === "pending") return { success: true };

  const token = randomBytes(32).toString("base64url");
  const row = {
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    church_name: input.churchName || null,
    relationship: input.relationship,
    scope: input.scope,
    details: input.details || null,
    token_hash: sha(token),
    token_expires_at: new Date(
      Date.now() + TOKEN_HOURS * 3_600_000,
    ).toISOString(),
  };
  const { error } = open
    ? await admin.from("deletion_form_requests").update(row).eq("id", open.id)
    : await admin.from("deletion_form_requests").insert(row);
  if (error) {
    console.error("deletion_form_requests save failed:", error.message);
    return {
      error:
        "Something went wrong. Please try again, or email admin@kingdomflow.in.",
    };
  }

  const link = `${getSiteUrl()}/delete-account/confirm?token=${token}`;
  const result = await sendBulkEmail({
    fromName: "KingdomFlow",
    subject: "Confirm your account deletion request",
    html: `<div style="font-family:sans-serif;max-width:480px"><p>Hi ${escapeHtml(input.name)},</p><p>We received a request to delete your KingdomFlow account. To confirm it was you, open this link within ${TOKEN_HOURS} hours:</p><p><a href="${link}">Confirm my deletion request</a></p><p>If you didn't ask for this, ignore this email and nothing will happen.</p></div>`,
    recipients: [input.email],
  });
  if (result.failed.length > 0) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: "Deletion request confirmation email failed to send",
    });
    return {
      error:
        "We couldn't send the confirmation email. Please check the address and try again.",
    };
  }
  return { success: true };
}

export interface ConfirmState {
  error?: string;
  success?: boolean;
}

// The person pressed "Confirm" on the page their email linked to.
export async function confirmDeletionRequest(
  token: string,
): Promise<ConfirmState> {
  if (!token) return { error: "This link isn't valid." };
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("deletion_form_requests")
    .select("*")
    .eq("token_hash", sha(token))
    .maybeSingle();
  if (!request) return { error: "This link isn't valid." };
  if (
    request.status === "pending" ||
    request.status === "completed" ||
    request.status === "rejected"
  )
    return { success: true };
  if (
    !request.token_expires_at ||
    new Date(request.token_expires_at) < new Date()
  )
    return { error: "This link has expired. Please submit the form again." };

  const { error } = await admin
    .from("deletion_form_requests")
    .update({
      status: "pending",
      verified_at: new Date().toISOString(),
      token_hash: null,
      token_expires_at: null,
    })
    .eq("id", request.id)
    .eq("status", "unverified");
  if (error) return { error: "Something went wrong. Please try again." };

  if (isEmailConfigured()) {
    await sendBulkEmail({
      fromName: "KingdomFlow Deletion Requests",
      subject: `Account deletion request from ${request.name}`,
      html: `<div style="font-family:sans-serif;max-width:520px"><h2>New account deletion request</h2><p><strong>Name:</strong> ${escapeHtml(request.name)}<br><strong>Email (confirmed):</strong> ${escapeHtml(request.email)}<br><strong>Phone:</strong> ${escapeHtml(request.phone ?? "—")}<br><strong>Church:</strong> ${escapeHtml(request.church_name ?? "—")}<br><strong>Relationship:</strong> ${escapeHtml(request.relationship)}<br><strong>Scope:</strong> ${escapeHtml(request.scope)}</p><p style="white-space:pre-wrap">${escapeHtml(request.details ?? "")}</p><p>Handle it in Super Admin → Deletions.</p></div>`,
      recipients: [INBOX],
      replyTo: request.email,
    });
  }
  revalidatePath("/platform-admin/deletion-requests");
  return { success: true };
}

// Whether a confirmation link is still usable, for showing the right page.
export async function checkDeletionToken(
  token: string,
): Promise<"valid" | "done" | "invalid"> {
  if (!token) return "invalid";
  const { data } = await createAdminClient()
    .from("deletion_form_requests")
    .select("status, token_expires_at")
    .eq("token_hash", sha(token))
    .maybeSingle();
  if (!data) return "invalid";
  if (data.status !== "unverified") return "done";
  return data.token_expires_at && new Date(data.token_expires_at) > new Date()
    ? "valid"
    : "invalid";
}

// ---- Super Admin ----

export interface ProcessFormResult {
  error?: string;
  success?: boolean;
}

export async function processDeletionFormRequestAction(
  id: string,
  decision: "completed" | "rejected",
  note: string,
): Promise<ProcessFormResult> {
  const user = await requirePlatformAdmin();
  if (decision !== "completed" && decision !== "rejected")
    return { error: "Choose completed or declined." };
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("deletion_form_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!request) return { error: "That request wasn't found." };
  if (request.status !== "pending")
    return { error: "Only a confirmed, pending request can be processed." };
  const cleanNote = note.trim().slice(0, 500);
  const { error } = await admin
    .from("deletion_form_requests")
    .update({
      status: decision,
      outcome_note: cleanNote || null,
      processed_by: user.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Couldn't update the request. Please try again." };

  if (isEmailConfigured()) {
    const done = decision === "completed";
    await sendBulkEmail({
      fromName: "KingdomFlow",
      subject: done
        ? "Your account deletion request is complete"
        : "About your account deletion request",
      html: `<div style="font-family:sans-serif;max-width:480px"><p>Hi ${escapeHtml(request.name)},</p><p>${
        done
          ? "Your account deletion request has been completed. Your sign-in and the data you asked us to remove have been deleted, apart from records we must keep by law (such as tax invoices)."
          : "We couldn't complete your deletion request."
      }</p>${cleanNote ? `<p>${escapeHtml(cleanNote)}</p>` : ""}<p>Questions? Reply to this email.</p></div>`,
      recipients: [request.email],
      replyTo: INBOX,
    });
  }
  await logPlatformEvent({
    level: "warning",
    source: "platform_admin",
    message: `Web deletion request ${decision} for ${request.email} by ${user.email ?? user.id}`,
  });
  revalidatePath("/platform-admin/deletion-requests");
  return { success: true };
}
