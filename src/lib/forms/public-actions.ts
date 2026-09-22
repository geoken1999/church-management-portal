"use server";

import { createClient } from "@/lib/supabase/server";

export interface PublicFormState {
  error?: string;
  success?: boolean;
}

// Bound with the form's slug via .bind(null, slug) on the client, so it
// fits useActionState's (prevState, formData) signature. No requireUser()
// here on purpose — this runs for anonymous visitors filling out a
// published form. Field-by-field validation (required fields, published
// status) happens inside submit_form_response itself, not here — this is
// just a thin bridge from FormData to the jsonb answers object it expects.
export async function submitPublicForm(
  slug: string,
  _prevState: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  const fieldKeys = String(formData.get("__fieldKeys") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const checkboxKeys = new Set(
    String(formData.get("__checkboxKeys") ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );

  const answers: Record<string, string | boolean> = {};
  for (const key of fieldKeys) {
    if (checkboxKeys.has(key)) {
      answers[key] = formData.get(key) === "on";
      continue;
    }
    const raw = formData.get(key);
    if (raw !== null) {
      const value = String(raw).trim();
      if (value) answers[key] = value;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_form_response", { form_slug: slug, answers });

  if (error) {
    return { error: error.message || "Couldn't submit this form. Please try again." };
  }

  return { success: true };
}
