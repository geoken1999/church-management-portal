"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { GivingForm } from "@/components/finance/GivingForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { FundraiserPaymentMode } from "@/types/database";

export interface PublicFundraiserData {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_logo_url: string | null;
  title: string;
  description: string | null;
  goal_amount: number;
  raised_amount: number;
  payment_mode: FundraiserPaymentMode | null;
}

function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function NotFoundCard() {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Card size="lg">
        <CardHeader>
          <CardTitle className="text-xl">{t.common.linkNotFound}</CardTitle>
          <CardDescription>{t.publicGive.notFoundDescription}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function GiveContent({ token, fundraiser }: { token: string; fundraiser: PublicFundraiserData }) {
  const { t } = useLocale();
  const percent = fundraiser.goal_amount > 0 ? Math.min(100, (fundraiser.raised_amount / fundraiser.goal_amount) * 100) : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <PublicBrandHeader logoUrl={fundraiser.organization_logo_url} name={fundraiser.organization_name} />

      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold">{fundraiser.title}</h1>
        {fundraiser.description && <p className="mt-2 text-sm text-muted-foreground">{fundraiser.description}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {formatMoney(fundraiser.raised_amount)} {t.publicGive.raised}
          </span>
          <span className="text-muted-foreground">
            {t.publicGive.ofGoal} {formatMoney(fundraiser.goal_amount)}
          </span>
        </div>
        <Progress value={fundraiser.raised_amount} max={fundraiser.goal_amount}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <p className="text-xs text-muted-foreground">
          {percent.toFixed(0)}% {t.publicGive.ofGoal}
        </p>
      </div>

      <GivingForm shareToken={token} organizationName={fundraiser.organization_name} />

      <div className="text-center">
        <p className="text-xs text-muted-foreground">{t.publicGive.securePayment}</p>
        <PublicPoweredByFooter />
      </div>
    </div>
  );
}

export function PublicGivePageView({ token, fundraiser }: { token: string; fundraiser: PublicFundraiserData | null }) {
  return (
    <PublicLocaleProvider>
      {fundraiser ? <GiveContent token={token} fundraiser={fundraiser} /> : <NotFoundCard />}
    </PublicLocaleProvider>
  );
}
