import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrgProofReview, type OrgProofRow } from "@/components/platform-admin/OrgProofReview";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Verification | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  await requirePlatformAdmin();
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id, name, verification_status, proof_document_name, proof_submitted_at, verification_note, created_at")
    .neq("verification_status", "verified")
    .order("proof_submitted_at", { ascending: true, nullsFirst: false })
    .limit(300);
  const rows = (data ?? []) as OrgProofRow[];
  const review = rows.filter((r) => r.verification_status === "under_review");
  const others = rows.filter((r) => r.verification_status !== "under_review");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Verification</h1>
        <p className="mt-1 text-muted-foreground">
          Registration documents churches have sent. Until a church has sent one, online giving, SMS, WhatsApp, email and Live stream stay closed for it.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold">To check ({review.length})</h2>
        {review.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing waiting.</CardContent>
          </Card>
        ) : (
          review.map((row) => <OrgProofReview key={row.id} row={row} />)
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold">Not verified ({others.length})</h2>
        <p className="text-sm text-muted-foreground">No document yet, or rejected. Mark a church verified if you already hold its paperwork.</p>
        {others.map((row) => (
          <OrgProofReview key={row.id} row={row} />
        ))}
      </section>
    </div>
  );
}
