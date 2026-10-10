import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeBilingual } from "@/lib/bilingual/config";
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

  // The two-language setting and its translations are read here rather than
  // through get_public_form, so that RPC didn't have to change. Only for a
  // form the RPC actually returned (i.e. published).
  let bilingual = null;
  if (data) {
    const { data: row } = await createAdminClient().from("forms").select("bilingual").eq("slug", slug).maybeSingle();
    bilingual = sanitizeBilingual(row?.bilingual);
  }

  return <PublicFormPageView slug={slug} data={data ? { ...data, bilingual } : null} />;
}
