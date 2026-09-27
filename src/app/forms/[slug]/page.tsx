import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicFormPageView } from "@/components/forms/PublicFormPageView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_form", { form_slug: slug }).maybeSingle();

  return { title: data ? `${data.title} | KingdomFlow` : "Form | KingdomFlow" };
}

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_form", { form_slug: slug }).maybeSingle();

  if (error) {
    // Never shown to the visitor (PublicFormPageView's not-found card covers
    // that) — this is purely so a real cause (e.g. migration 0048 not yet
    // applied, so this RPC doesn't exist) shows up in server logs instead of
    // being indistinguishable from a genuinely missing/unpublished form.
    console.error(`get_public_form(${slug}) failed:`, error.message);
  }

  return <PublicFormPageView slug={slug} data={data ?? null} />;
}
