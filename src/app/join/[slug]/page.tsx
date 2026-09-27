import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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

  return <PublicJoinPageView slug={slug} data={data ?? null} />;
}
