import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectTranslatableStrings, sanitizeBilingual } from "@/lib/bilingual/config";
import { ensureTranslations } from "@/lib/bilingual/translate";
import { PublicJoinPageView } from "@/components/members/PublicJoinPageView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_join_form", { org_slug: slug }).maybeSingle();

  return { title: data ? `Join ${data.organization_name} | KingdomFlow` : "Join | KingdomFlow" };
}

export default async function PublicJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_join_form", { org_slug: slug }).maybeSingle();

  // Two-language setting. The church's custom questions are translated
  // when it turns the setting on, but a field added afterwards would have no
  // translation yet, so any missing ones are filled in here (once, then
  // saved) instead of waiting for an admin to re-save. Never allowed to
  // break the page.
  let bilingual = null;
  if (data) {
    try {
      const admin = createAdminClient();
      const { data: org } = await admin.from("organizations").select("join_bilingual").eq("id", data.organization_id).maybeSingle();
      bilingual = sanitizeBilingual(org?.join_bilingual);
      if (bilingual) {
        const strings = collectTranslatableStrings({ fields: data.field_definitions ?? [] });
        if (strings.some((text) => !bilingual!.translations[text])) {
          const outcome = await ensureTranslations(bilingual, strings, bilingual);
          bilingual = outcome.config;
          if (!outcome.warning) await admin.from("organizations").update({ join_bilingual: outcome.config }).eq("id", data.organization_id);
        }
      }
    } catch (err) {
      console.error(`Join form translation for ${slug} failed:`, err);
    }
  }

  return <PublicJoinPageView slug={slug} data={data ? { ...data, bilingual } : null} />;
}
