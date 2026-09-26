import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicFormFillForm } from "@/components/forms/PublicFormFillForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_form", { form_slug: slug }).maybeSingle();

  return { title: data ? `${data.title} | KingdomFlow` : "Form | KingdomFlow" };
}

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_form", { form_slug: slug }).maybeSingle();

  if (error) {
    // Never shown to the visitor (the generic card below covers that) —
    // this is purely so a real cause (e.g. migration 0048 not yet applied,
    // so this RPC doesn't exist) shows up in server logs instead of being
    // indistinguishable from a genuinely missing/unpublished form.
    console.error(`get_public_form(${slug}) failed:`, error.message);
  }

  if (!data) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
          aria-hidden
        />
        <Card size="lg" className="relative w-full max-w-md rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Form not found</CardTitle>
            <CardDescription>
              This link is invalid or the form isn&apos;t accepting responses right now.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
        aria-hidden
      />

      <div className="relative w-full max-w-xl md:max-w-2xl lg:max-w-3xl">
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
