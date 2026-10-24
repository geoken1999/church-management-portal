import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { FeedbackForm } from "@/components/visitors/FeedbackForm";
import { feedbackPageFor } from "@/lib/visitors/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your feedback | KingdomFlow" };

// The page the WhatsApp message links to, the day after a first visit.
export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await feedbackPageFor(token);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-3 py-12 sm:px-6">
      <Card size="lg">
        {page ? (
          <>
            <CardHeader className="px-4 sm:px-7">
              <CardTitle className="text-lg">How was your visit to {page.churchName}?</CardTitle>
              <CardDescription>{page.firstName ? `Hi ${page.firstName}, ` : ""}thank you for coming. It takes about a minute.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-7">
              <FeedbackForm token={token} firstName={page.firstName} churchName={page.churchName} alreadyAnswered={page.alreadyAnswered} />
            </CardContent>
          </>
        ) : (
          <CardHeader>
            <CardTitle className="text-xl">Link not found</CardTitle>
            <CardDescription>This feedback link isn&apos;t valid any more.</CardDescription>
          </CardHeader>
        )}
      </Card>
      <PublicPoweredByFooter />
    </div>
  );
}
