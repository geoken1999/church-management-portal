import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicGivePageView } from "@/components/finance/PublicGivePageView";

async function getSharedFundraiser(token: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_fundraiser", { token }).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const fundraiser = await getSharedFundraiser(token);
  return { title: fundraiser ? `Give to ${fundraiser.title} | KingdomFlow` : "Give | KingdomFlow" };
}

export default async function GivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fundraiser = await getSharedFundraiser(token);

  return <PublicGivePageView token={token} fundraiser={fundraiser ?? null} />;
}
