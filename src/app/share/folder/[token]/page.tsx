import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicFolderPageView } from "@/components/documents/PublicFolderPageView";

async function getSharedCategory(token: string) {
  const supabase = await createClient();
  const [{ data: category }, { data: documents }] = await Promise.all([
    supabase.rpc("get_shared_category", { token }).maybeSingle(),
    supabase.rpc("get_shared_category_documents", { token }),
  ]);
  return { category, documents: documents ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { category } = await getSharedCategory(token);
  return { title: category ? `${category.name} | KingdomFlow` : "Shared folder | KingdomFlow" };
}

export default async function SharedFolderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { category, documents } = await getSharedCategory(token);

  return <PublicFolderPageView token={token} category={category ?? null} documents={documents} />;
}
