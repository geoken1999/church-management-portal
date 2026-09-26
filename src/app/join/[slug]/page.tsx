import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicJoinForm } from "@/components/members/PublicJoinForm";
import { DEFAULT_CHURCH_LOGO, PublicPoweredByFooter } from "@/components/PublicBrandHeader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_join_form", { org_slug: slug }).maybeSingle();

  return { title: data ? `Join ${data.organization_name} | KingdomFlow` : "Join | KingdomFlow" };
}

export default async function PublicJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_join_form", { org_slug: slug }).maybeSingle();

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <Card size="lg">
          <CardHeader>
            <CardTitle className="text-xl">Page not found</CardTitle>
            <CardDescription>This join link is invalid. Double-check the link with your church.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
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
          <p className="text-sm text-muted-foreground">Request to join our church family.</p>
        </div>
      </div>

      <Card size="lg">
        <CardHeader>
          <CardTitle className="text-lg">Join {data.organization_name}</CardTitle>
          <CardDescription>
            Fill in your details below. A member of our team will review your request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PublicJoinForm
            orgSlug={slug}
            fieldDefinitions={data.field_definitions ?? []}
            branches={data.branches ?? []}
          />
        </CardContent>
      </Card>

      <PublicPoweredByFooter />
    </div>
  );
}
