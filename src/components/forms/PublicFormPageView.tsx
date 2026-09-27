"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicFormFillForm } from "@/components/forms/PublicFormFillForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { FormField } from "@/types/database";

export interface PublicFormPageData {
  title: string;
  description: string | null;
  fields: FormField[] | null;
  organization_name: string;
  organization_logo_url: string | null;
}

function NotFoundCard() {
  const { t } = useLocale();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
        aria-hidden
      />
      <Card size="lg" className="relative w-full max-w-md rounded-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">{t.common.linkNotFound}</CardTitle>
          <CardDescription>{t.publicForm.notFoundDescription}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function FormContent({ slug, data }: { slug: string; data: PublicFormPageData }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
        aria-hidden
      />

      <div className="relative w-full max-w-xl md:max-w-2xl lg:max-w-3xl">
        <div className="mb-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <PublicBrandHeader logoUrl={data.organization_logo_url} name={data.organization_name} />

        <Card size="lg" className="rounded-2xl shadow-lg md:[--card-spacing:--spacing(9)]">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">{data.title}</CardTitle>
            {data.description && <CardDescription className="text-base">{data.description}</CardDescription>}
          </CardHeader>
          <CardContent>
            <PublicFormFillForm slug={slug} fields={data.fields ?? []} />
          </CardContent>
        </Card>

        <PublicPoweredByFooter />
      </div>
    </div>
  );
}

export function PublicFormPageView({ slug, data }: { slug: string; data: PublicFormPageData | null }) {
  return <PublicLocaleProvider>{data ? <FormContent slug={slug} data={data} /> : <NotFoundCard />}</PublicLocaleProvider>;
}
