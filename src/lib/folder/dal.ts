import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getSharedDocuments = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shared_documents")
    .select("*, profiles(first_name, last_name), folder_categories(id, name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return data ?? [];
});

export const getFolderCategories = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("folder_categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  return data ?? [];
});
