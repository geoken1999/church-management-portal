import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Volunteer check | KingdomFlow",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What a volunteer's ID card QR code opens: confirms the person is a volunteer of the
// church, and whether they are still active. Shows only a name, the church and the
// role; it is open to anyone who scans the card.
export default async function VerifyVolunteerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let volunteer: { volunteer_no: string; first_name: string; last_name: string; role: string; team: string | null; status: string; organization_name: string; logo_url: string | null } | null = null;
  if (UUID.test(token)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("verify_volunteer", { token });
    volunteer = data?.[0] ?? null;
  }
  const active = volunteer?.status === "active";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-6">
        <Logo />
      </div>
      <Card className="w-full max-w-sm rounded-2xl shadow-lg">
        <CardContent className="space-y-4 py-8 text-center">
          {!volunteer ? (
            <>
              <ShieldAlert className="mx-auto size-12 text-destructive" />
              <h1 className="font-heading text-xl font-bold">Not a valid volunteer ID</h1>
              <p className="text-sm text-muted-foreground">This code doesn&apos;t match any volunteer. Please check with the church.</p>
            </>
          ) : (
            <>
              {active ? <BadgeCheck className="mx-auto size-12 text-emerald-600" /> : <ShieldAlert className="mx-auto size-12 text-amber-600" />}
              <h1 className="font-heading text-xl font-bold">{active ? "Verified volunteer" : "No longer an active volunteer"}</h1>
              <div className="space-y-1">
                <p className="text-lg font-semibold">
                  {volunteer.first_name} {volunteer.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {volunteer.role}
                  {volunteer.team ? ` · ${volunteer.team}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">{volunteer.organization_name}</p>
                <p className="text-xs text-muted-foreground">ID {volunteer.volunteer_no}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
