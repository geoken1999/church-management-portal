"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { validateProfileDetails, type ProfileDetailsFieldErrors } from "@/lib/auth/validation";
import { isAppLocale, type AppLocale } from "@/lib/i18n/config";

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

// Called from the language switcher (src/components/dashboard/
// LanguageSwitcher.tsx) the instant someone picks a new language — no form
// submission, just this one field. Silently ignores an unsupported value
// rather than erroring, since the only caller is that switcher's own
// fixed, validated option list.
export async function updateProfileLocale(locale: AppLocale): Promise<void> {
  if (!isAppLocale(locale)) return;
  const user = await requireUser();

  const supabase = await createClient();
  await supabase.from("profiles").update({ locale }).eq("auth_user_id", user.id);

  revalidatePath("/dashboard");
}
