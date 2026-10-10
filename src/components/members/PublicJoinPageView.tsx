"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicJoinForm } from "@/components/members/PublicJoinForm";
import { DEFAULT_CHURCH_LOGO, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useBilingualLabel } from "@/lib/bilingual/use-bilingual";
import type { BilingualConfig } from "@/lib/bilingual/config";
import type { PublicFieldDefinition } from "@/types/database";

export interface PublicJoinPageData {
  organization_id: string;
  organization_name: string;
  organization_logo_url: string | null;
  field_definitions: PublicFieldDefinition[] | null;
  branches: { id: string; name: string }[] | null;
  bilingual?: BilingualConfig | null;
}

function NotFoundCard() {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-3 py-12 sm:px-6">
      <Card size="lg">
        <CardHeader className="px-4 sm:px-7">
          <CardTitle className="text-xl">{t.common.linkNotFound}</CardTitle>
          <CardDescription>{t.publicJoin.notFoundDescription}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function JoinContent({ slug, data }: { slug: string; data: PublicJoinPageData }) {
  const bt = useBilingualLabel(data.bilingual ?? null);
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-3 py-12 sm:px-6 md:max-w-2xl lg:max-w-3xl">
      <div className="mb-2 flex justify-end">
        <LanguageSwitcher />
      </div>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {/* Plain <img>, not next/image — a public storage URL here shouldn't
            depend on next.config.ts's remotePatterns matching exactly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.organization_logo_url ?? DEFAULT_CHURCH_LOGO}
          alt={data.organization_name}
          width={64}
          height={64}
          className="size-16 rounded-xl object-cover"
        />
        <div>
          <h1 className="font-heading text-xl font-bold">{data.organization_name}</h1>
          <p className="text-sm text-muted-foreground">{bt((d) => d.publicJoin.tagline)}</p>
        </div>
      </div>

      <Card size="lg">
        <CardHeader className="px-4 sm:px-7">
          <CardTitle className="text-lg">{bt((d) => d.publicJoin.joinHeading(data.organization_name))}</CardTitle>
          <CardDescription>{bt((d) => d.publicJoin.joinDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-7">
          <PublicJoinForm orgSlug={slug} fieldDefinitions={data.field_definitions ?? []} branches={data.branches ?? []} bilingual={data.bilingual ?? null} />
        </CardContent>
      </Card>

      <PublicPoweredByFooter />
    </div>
  );
}

export function PublicJoinPageView({ slug, data }: { slug: string; data: PublicJoinPageData | null }) {
  return <PublicLocaleProvider>{data ? <JoinContent slug={slug} data={data} /> : <NotFoundCard />}</PublicLocaleProvider>;
}
