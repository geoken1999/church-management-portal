import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_CHURCH_LOGO, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { VisitorForm } from "@/components/visitors/VisitorForm";
import { publicChurchBySlug } from "@/lib/visitors/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const church = await publicChurchBySlug(slug);
  return { title: church ? `Welcome to ${church.name} | KingdomFlow` : "Welcome | KingdomFlow" };
}

// The page behind the church's visitor QR code: a first-time guest leaves their details.
export default async function VisitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const church = await publicChurchBySlug(slug);

  if (!church) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-3 py-12">
        <Card size="lg">
          <CardHeader>
            <CardTitle className="text-xl">Link not found</CardTitle>
            <CardDescription>This visitor page isn&apos;t available. Please ask the church for a new QR code.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-3 py-12 sm:px-6">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={church.logoUrl ?? DEFAULT_CHURCH_LOGO} alt={church.name} width={64} height={64} className="size-16 rounded-xl object-cover" />
        <div>
          <h1 className="font-heading text-xl font-bold">{church.name}</h1>
          <p className="text-sm text-muted-foreground">First time here? We&apos;d love to know you.</p>
        </div>
      </div>
      <Card size="lg">
        <CardHeader className="px-4 sm:px-7">
          <CardTitle className="text-lg">Welcome!</CardTitle>
          <CardDescription>Tell us a little about you so we can welcome you properly.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-7">
          <VisitorForm slug={church.slug} churchName={church.name} />
        </CardContent>
      </Card>
      <PublicPoweredByFooter />
    </div>
  );
}
