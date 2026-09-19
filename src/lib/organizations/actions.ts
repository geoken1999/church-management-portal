"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { getAuthErrorMessage } from "@/lib/auth/errors";
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
import type { MemberCountRange } from "@/types/database";

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

export interface InviteMemberState {
  error?: string;
  inviteToken?: string;
}

export async function inviteMember(
  _prevState: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: organizationId,
      email,
      role: "member",
      invited_by: user.id,
    })
    .select("token")
    .single();

  if (error || !data) {
    return { error: "Couldn't send that invitation. You may not have permission to invite members." };
  }

  revalidatePath("/dashboard");
  return { inviteToken: data.token };
}

export async function revokeInvitation(formData: FormData) {
  await requireUser();
  const invitationId = String(formData.get("invitationId") ?? "");

  const supabase = await createClient();
  await supabase.from("organization_invitations").delete().eq("id", invitationId);

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
    .update({
      member_count_range: memberCountRange as MemberCountRange,
      branch_count: Number(branchCountRaw),
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
