import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicEventRegistrationPageView } from "@/components/events/PublicEventRegistrationPageView";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_event_registration", { token }).maybeSingle();

  return { title: data ? `Register — ${data.title} | KingdomFlow` : "Event registration | KingdomFlow" };
}

export default async function PublicEventRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_event_registration", { token }).maybeSingle();

  if (error) {
    // Never shown to the visitor — mirrors /forms/[slug]'s same reasoning
    // (e.g. migration 0067 not yet applied shouldn't look identical to a
    // genuinely missing/disabled event to whoever's debugging this).
    console.error(`get_public_event_registration(${token}) failed:`, error.message);
  }

  return <PublicEventRegistrationPageView token={token} data={data ?? null} />;
}
