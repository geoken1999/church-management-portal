"use server";

import { createClient } from "@/lib/supabase/server";

export interface PublicWidgetState {
  error?: string;
  success?: boolean;
}

// Anonymous visitor submission from inside the embedded widget iframe —
// mirrors submitPublicForm exactly (no requireUser(), field validation
// happens server-side in the submit_widget_response RPC), plus page_url
// which the widget page captures from document.referrer since a
// cross-origin iframe's own location is always the widget's own domain.
export async function submitWidgetResponse(
  token: string,
  _prevState: PublicWidgetState,
  formData: FormData,
): Promise<PublicWidgetState> {
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

  const pageUrl = String(formData.get("__pageUrl") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_widget_response", { token, answers, page_url: pageUrl });

  if (error) {
    return { error: error.message || "Couldn't send that. Please try again." };
  }
  return { success: true };
}
