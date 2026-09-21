"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { generatePassword } from "@/lib/auth/password";
import { validateName, validatePhone } from "@/lib/auth/validation";
import { TAB_KEYS } from "@/lib/permissions/tabs";
import {
  validateOrganizationName,
  slugify,
  randomSlugSuffix,
  isMemberCountRange,
  validateBranchCount,
  CHURCH_ROLE_OPTIONS,
  MAX_LOGO_BYTES,
  ALLOWED_LOGO_TYPES,
} from "@/lib/organizations/validation";
import { checkStorageQuota, checkTeamMemberQuota } from "@/lib/plans/dal";
import type { MemberCountRange, OrganizationRole, TabPermissions } from "@/types/database";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readTabPermissionsFromForm(formData: FormData): TabPermissions {
  const result: TabPermissions = {};
  for (const tab of TAB_KEYS) {
    result[tab] = {
      read: formData.get(`perm_${tab}_read`) === "on",
      write: formData.get(`perm_${tab}_write`) === "on",
      delete: formData.get(`perm_${tab}_delete`) === "on",
    };
  }
  return result;
}

// Both createMemberLogin and updateMemberPermissions need to confirm the
// caller manages this specific organization — reused rather than trusting a
// role check elsewhere, since these actions read organizationId from the
// submitted form rather than a verified "active organization".
async function requireOrgManager(organizationId: string, authUserId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  return data?.role === "owner" || data?.role === "admin";
}

export interface CreateOrganizationState {
  error?: string;
  fieldErrors?: {
    name?: string;
    memberCountRange?: string;
    branchCount?: string;
    role?: string;
  };
}

export async function createOrganization(
  _prevState: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  await requireUser();

  const name = String(formData.get("name") ?? "");
  const memberCountRange = String(formData.get("memberCountRange") ?? "");
  const branchCountRaw = String(formData.get("branchCount") ?? "");
  const role = String(formData.get("role") ?? "");
  const roleOther = String(formData.get("roleOther") ?? "").trim();

  const fieldErrors: CreateOrganizationState["fieldErrors"] = {};
  const nameError = validateOrganizationName(name);
  if (nameError) fieldErrors.name = nameError;
  if (!isMemberCountRange(memberCountRange)) {
    fieldErrors.memberCountRange = "Select how many members your church has.";
  }
  const branchCountError = validateBranchCount(branchCountRaw);
  if (branchCountError) fieldErrors.branchCount = branchCountError;
  if (!role || !(CHURCH_ROLE_OPTIONS as readonly string[]).includes(role)) {
    fieldErrors.role = "Select your role at the church.";
  } else if (role === "Other" && !roleOther) {
    fieldErrors.role = "Enter your role.";
  }

  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const memberTitle = role === "Other" ? roleOther : role;
  const branchCount = Number(branchCountRaw);

  const supabase = await createClient();
  const baseSlug = slugify(name) || "organization";

  // Slugs are unique; retry a couple of times with a random suffix on
  // collision rather than surfacing a raw database error to the user.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;
    const { error } = await supabase.rpc("create_organization", {
      org_name: name.trim(),
      org_slug: slug,
      member_count_range: memberCountRange,
      branch_count: branchCount,
      member_title: memberTitle,
    });

    if (!error) {
      redirect("/dashboard");
    }

    if (!error.message.toLowerCase().includes("duplicate") && !error.message.includes("unique")) {
      return { error: getAuthErrorMessage(error) };
    }
  }

  return { error: "Couldn't create your organization. Please try a different name." };
}

export interface AcceptInvitationState {
  error?: string;
}

export async function acceptInvitation(
  _prevState: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  await requireUser();

  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { invite_token: token });

  if (error) {
    return { error: error.message || "This invitation could not be accepted." };
  }

  redirect("/dashboard");
}

export async function switchOrganization(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (membership) {
    await supabase
      .from("profiles")
      .update({ active_organization_id: organizationId })
      .eq("auth_user_id", user.id);
  }

  revalidatePath("/dashboard");
}

export async function removeMember(formData: FormData) {
  await requireUser();
  const memberId = String(formData.get("memberId") ?? "");

  const supabase = await createClient();
  await supabase.from("organization_members").delete().eq("id", memberId);

  revalidatePath("/dashboard");
}

export interface UpdateOrganizationDetailsState {
  error?: string;
  fieldErrors?: {
    memberCountRange?: string;
    branchCount?: string;
  };
  success?: boolean;
}

// Deliberately excludes the org name — that stays fixed once created (it's
// tied to the workspace slug). Congregation size and location count are
// just informational metadata, safe to let admins update freely.
export async function updateOrganizationDetails(
  _prevState: UpdateOrganizationDetailsState,
  formData: FormData,
): Promise<UpdateOrganizationDetailsState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const memberCountRange = String(formData.get("memberCountRange") ?? "");
  const branchCountRaw = String(formData.get("branchCount") ?? "");
  const country = String(formData.get("country") ?? "").trim();

  const fieldErrors: UpdateOrganizationDetailsState["fieldErrors"] = {};
  if (!isMemberCountRange(memberCountRange)) {
    fieldErrors.memberCountRange = "Select how many members your church has.";
  }
  const branchCountError = validateBranchCount(branchCountRaw);
  if (branchCountError) fieldErrors.branchCount = branchCountError;

  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    // Runtime-validated above via isMemberCountRange/validateBranchCount.
    // country is optional — a blank string here just clears it.
    .update({
      member_count_range: memberCountRange as MemberCountRange,
      branch_count: Number(branchCountRaw),
      country: country || null,
    })
    .eq("id", organizationId);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to edit this church." };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { success: true };
}

export interface UpdateLogoState {
  error?: string;
}

export async function updateOrganizationLogo(
  _prevState: UpdateLogoState,
  formData: FormData,
): Promise<UpdateLogoState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return { error: "Logo must be a PNG, JPEG, WebP, or SVG image." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo must be smaller than 10MB." };
  }

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) {
    return { error: quotaError };
  }

  const supabase = await createClient();
  const path = `${organizationId}/logo`;

  const { error: uploadError } = await supabase.storage
    .from("organization-logos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { error: "Couldn't upload that logo. You may not have permission to update it." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("organization-logos").getPublicUrl(path);

  // Cache-bust: the object path never changes on re-upload, so without a
  // query param the browser/CDN would keep serving the previous image.
  const { error: updateError } = await supabase
    .from("organizations")
    .update({ logo_url: `${publicUrl}?v=${Date.now()}` })
    .eq("id", organizationId);

  if (updateError) {
    return { error: "Uploaded the image, but couldn't save it to your organization." };
  }

  revalidatePath("/dashboard");
  return {};
}

export interface CreateLoginState {
  error?: string;
  fieldErrors?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  success?: boolean;
  email?: string;
  password?: string;
}

// Issues a ready-to-use login directly, rather than requiring the person to
// self-register and pick their own password — meant for church staff who
// won't sign up on their own; the admin shares the generated password with
// them out of band.
export async function createMemberLogin(
  _prevState: CreateLoginState,
  formData: FormData,
): Promise<CreateLoginState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const role: OrganizationRole = String(formData.get("role") ?? "member") === "admin" ? "admin" : "member";

  const fieldErrors: CreateLoginState["fieldErrors"] = {};
  const firstNameError = validateName(firstName, "First name");
  if (firstNameError) fieldErrors.firstName = firstNameError;
  const lastNameError = validateName(lastName, "Last name");
  if (lastNameError) fieldErrors.lastName = lastNameError;
  if (!email || !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  const phoneError = validatePhone(phone);
  if (phoneError) fieldErrors.phone = phoneError;
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  if (!(await requireOrgManager(organizationId, user.id))) {
    return { error: "You don't have permission to create logins for this organization." };
  }

  const quotaError = await checkTeamMemberQuota(organizationId);
  if (quotaError) {
    return { error: quotaError };
  }

  const tabPermissions = role === "member" ? readTabPermissionsFromForm(formData) : null;
  const password = generatePassword();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Service role key isn't configured — see .env.local. Manually-issued logins need it." };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, phone: phone || null },
  });

  if (createError || !created.user) {
    if (createError?.message.toLowerCase().includes("already")) {
      return { fieldErrors: { email: "A user with that email already exists." } };
    }
    return { error: "Couldn't create that login. Please try again." };
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organizationId,
    auth_user_id: created.user.id,
    role,
    tab_permissions: tabPermissions,
  });

  if (memberError) {
    // Roll back the orphaned auth user so a retry doesn't hit "already exists".
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Couldn't add that user to your organization. Please try again." };
  }

  revalidatePath("/dashboard/team");
  return { success: true, email, password };
}

// Member-only by the .eq("role", "member") guard below — owner/admin access
// is always full and isn't governed by tab_permissions, so there's nothing
// meaningful to set for them.
export async function updateMemberPermissions(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");

  if (!(await requireOrgManager(organizationId, user.id))) {
    return;
  }

  const tabPermissions = readTabPermissionsFromForm(formData);
  const supabase = await createClient();
  await supabase
    .from("organization_members")
    .update({ tab_permissions: tabPermissions })
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .eq("role", "member");

  revalidatePath("/dashboard/team");
}
