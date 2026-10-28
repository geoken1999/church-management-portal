import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupportTeamManager } from "@/components/platform-admin/SupportTeamManager";

export const metadata: Metadata = { title: "Support team | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function SupportTeamPage() {
  await requirePlatformAdmin();
  const { data } = await createAdminClient().from("support_staff").select("*").order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Support team</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          People who help churches. They sign in at the normal login page and land on the Support console at /support-desk, where they can
          reply to tickets and look at a church read-only. They cannot change plans, billing, payouts or any church data, and cannot see
          proof documents. Switching someone off ends their access immediately.
        </p>
      </div>
      <SupportTeamManager staff={data ?? []} />
    </div>
  );
}
