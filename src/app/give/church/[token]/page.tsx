import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicChurchGiveView } from "@/components/finance/PublicChurchGiveView";
import { normalizeGivingTypes, isGivingType } from "@/lib/finance/giving-types";

async function getChurchGiving(token: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_church_giving", { token }).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const church = await getChurchGiving(token);
  return { title: church ? `Give to ${church.organization_name} | KingdomFlow` : "Give | KingdomFlow" };
}

export default async function ChurchGivePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { token } = await params;
  const { type } = await searchParams;
  const church = await getChurchGiving(token);
  const types = church ? normalizeGivingTypes(church.giving_types) : [];
  const initialType = isGivingType(type) && types.includes(type) ? type : types[0];

  return (
    <PublicChurchGiveView
      token={token}
      church={church && types.length > 0 && initialType ? { name: church.organization_name, logoUrl: church.organization_logo_url, types, initialType } : null}
    />
  );
}
