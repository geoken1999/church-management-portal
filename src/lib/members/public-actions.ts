"use server";

import { createClient } from "@/lib/supabase/server";
import { validateMemberBasics, validateMemberDetails } from "@/lib/members/validation";

export interface PublicJoinFormState {
  error?: string;
  fieldErrors?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    branchId?: string;
    dateOfBirth?: string;
    maritalStatus?: string;
    weddingDate?: string;
  };
  success?: boolean;
}

// Bound with the organization's slug via .bind(null, orgSlug) on the client,
// so it fits useActionState's (prevState, formData) signature. No
// requireUser() here on purpose — this runs for anonymous visitors filling
// out a church's public join form.
export async function submitMemberRequest(
  orgSlug: string,
  _prevState: PublicJoinFormState,
  formData: FormData,
): Promise<PublicJoinFormState> {
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();
  const maritalStatus = String(formData.get("maritalStatus") ?? "").trim();
  const weddingDate = String(formData.get("weddingDate") ?? "").trim();
  // Set by the form to however many branches the church has — lets us give
  // a proper field-level error instead of leaning on the RPC's generic one.
  const branchRequired = String(formData.get("__branchCount") ?? "0") !== "0";

  const fieldErrors: NonNullable<PublicJoinFormState["fieldErrors"]> = validateMemberBasics({
    firstName,
    lastName,
    email,
    phone,
  });
  // Phone is required on the public form specifically — validateMemberBasics
  // leaves it optional since the admin-side add/edit form still allows it.
  if (!phone) fieldErrors.phone = "Phone number is required.";
  if (branchRequired && !branchId) fieldErrors.branchId = "Please select a branch.";
  Object.assign(fieldErrors, validateMemberDetails({ dateOfBirth, maritalStatus, weddingDate }));
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const fieldKeys = String(formData.get("__fieldKeys") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  const customFields: Record<string, string> = {};
  for (const key of fieldKeys) {
    const raw = formData.get(`custom_${key}`);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (value !== "") customFields[key] = value;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_member_request", {
    org_slug: orgSlug,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    phone,
    branch_id: branchId || null,
    date_of_birth: dateOfBirth,
    marital_status: maritalStatus,
    email: email || null,
    wedding_date: maritalStatus === "married" ? weddingDate || null : null,
    custom_fields: customFields,
  });

  if (error) {
    return { error: error.message || "Couldn't submit your request. Please try again." };
  }

  return { success: true };
}
