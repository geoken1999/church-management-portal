"use client";

import { Suspense } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GivingForm } from "@/components/finance/GivingForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { GivingType } from "@/lib/finance/giving-types";

export interface PublicChurchGiving {
  name: string;
  logoUrl: string | null;
  types: GivingType[];
  initialType: GivingType;
}

function NotFoundCard() {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-3 py-12 sm:px-6">
      <Card size="lg">
        <CardHeader className="px-4 sm:px-7">
          <CardTitle className="text-xl">{t.common.linkNotFound}</CardTitle>
          <CardDescription>Online giving isn&apos;t available for this church right now.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function GiveContent({ token, church }: { token: string; church: PublicChurchGiving }) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-3 py-12 sm:px-6">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <PublicBrandHeader logoUrl={church.logoUrl} name={church.name} />
      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold">Give to {church.name}</h1>
      </div>
      {/* GivingForm reads ?payment= via useSearchParams (set when PayU redirects back). */}
      <Suspense fallback={null}>
        <GivingForm organizationName={church.name} church={{ token, types: church.types, initialType: church.initialType }} />
      </Suspense>
      <div className="text-center">
        <p className="text-xs text-muted-foreground">{t.publicGive.securePayment}</p>
        <PublicPoweredByFooter />
      </div>
    </div>
  );
}

export function PublicChurchGiveView({ token, church }: { token: string; church: PublicChurchGiving | null }) {
  return <PublicLocaleProvider>{church ? <GiveContent token={token} church={church} /> : <NotFoundCard />}</PublicLocaleProvider>;
}
