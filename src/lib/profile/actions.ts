"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { validateProfileDetails, type ProfileDetailsFieldErrors } from "@/lib/auth/validation";

export interface UpdateProfileState {
  errors?: ProfileDetailsFieldErrors;
  message?: string;
  success?: boolean;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateProfileDetails(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const user = await requireUser();

  const firstName = readString(formData, "firstName");
  const lastName = readString(formData, "lastName");
  const phone = readString(formData, "phone").trim();

  const errors = validateProfileDetails({ firstName, lastName, phone });
  if (Object.values(errors).some(Boolean)) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone || null,
    })
    .eq("auth_user_id", user.id);

  if (error) {
    return { message: "Couldn't save your changes. Please try again." };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { success: true, message: "Profile updated." };
}
