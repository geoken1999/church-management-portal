import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getForms = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const [{ data: forms }, { data: responses }] = await Promise.all([
    supabase.from("forms").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("form_responses").select("form_id").eq("organization_id", organizationId),
  ]);

  const responseCounts = new Map<string, number>();
  for (const response of responses ?? []) {
    responseCounts.set(response.form_id, (responseCounts.get(response.form_id) ?? 0) + 1);
  }

  return (forms ?? []).map((form) => ({
    ...form,
    responseCount: responseCounts.get(form.id) ?? 0,
  }));
});

export const getForm = cache(async (formId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("forms").select("*").eq("id", formId).maybeSingle();
  return data;
});

export const getFormResponses = cache(async (formId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_responses")
    .select("*")
    .eq("form_id", formId)
    .order("created_at", { ascending: false });

  return data ?? [];
});
