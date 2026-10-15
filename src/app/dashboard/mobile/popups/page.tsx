import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { PopupsPanel } from "@/components/mobile/PopupsPanel";
import type { AppPopup } from "@/types/database";

export const metadata: Metadata = {
  title: "App Popups | KingdomFlow",
};

export default async function AppPopupsPage() {
  const membership = await requireOrganization();
  const supabase = await createClient();
  const { data } = await supabase.from("app_popups").select("*").eq("organization_id", membership.organization.id).order("created_at", { ascending: false }).limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">App popups</h1>
        <p className="mt-1 text-muted-foreground">
          A message that opens over the app when members open it, with an optional button that opens a link. Use it for an urgent announcement, a special
          event or a call to action. Members need the latest version of the app.
        </p>
      </div>
      <PopupsPanel popups={(data ?? []) as AppPopup[]} />
    </div>
  );
}
