import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { GivingForm } from "@/components/finance/GivingForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";

function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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

  if (!fundraiser) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <Card size="lg">
          <CardHeader>
            <CardTitle className="text-xl">Link not found</CardTitle>
            <CardDescription>This giving link is invalid or is no longer active. Ask the church for a new link.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const percent = fundraiser.goal_amount > 0 ? Math.min(100, (fundraiser.raised_amount / fundraiser.goal_amount) * 100) : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <PublicBrandHeader logoUrl={fundraiser.organization_logo_url} name={fundraiser.organization_name} />

      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold">{fundraiser.title}</h1>
        {fundraiser.description && <p className="mt-2 text-sm text-muted-foreground">{fundraiser.description}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{formatMoney(fundraiser.raised_amount)} raised</span>
          <span className="text-muted-foreground">of {formatMoney(fundraiser.goal_amount)} goal</span>
        </div>
        <Progress value={fundraiser.raised_amount} max={fundraiser.goal_amount}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <p className="text-xs text-muted-foreground">{percent.toFixed(0)}% of goal</p>
      </div>

      <GivingForm shareToken={token} organizationName={fundraiser.organization_name} />

      <div className="text-center">
        <p className="text-xs text-muted-foreground">Secure payment powered by Razorpay.</p>
        <PublicPoweredByFooter />
      </div>
    </div>
  );
}
