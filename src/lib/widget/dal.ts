import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getWidget = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("website_widgets").select("*").eq("organization_id", organizationId).maybeSingle();
  return data;
});

export const getWidgetSubmissions = cache(async (widgetId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("widget_submissions")
    .select("*")
    .eq("widget_id", widgetId)
    .order("created_at", { ascending: false });

  return data ?? [];
});
