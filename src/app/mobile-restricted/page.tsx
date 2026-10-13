import type { Metadata } from "next";
import { Laptop } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Use the KingdomFlow app | KingdomFlow",
};

// Landed on by the middleware (src/lib/supabase/middleware.ts) whenever a
// phone browser requests the app itself (sign-in and anything past it).
// The public landing page, public forms, and the public join link never
// redirect here — this is specifically the dashboard/staff experience.
export default function MobileRestrictedPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
        aria-hidden
      />

      <div className="relative w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center gap-4">
          <Logo />
          <div className="flex size-14 items-center justify-center rounded-full bg-accent shadow-sm">
            <Laptop className="size-6 text-primary" />
          </div>
        </div>

        <Card size="lg" className="rounded-2xl text-left shadow-lg">
          <CardHeader>
            <CardTitle className="text-center font-heading text-xl">Use the KingdomFlow app</CardTitle>
            <CardDescription className="text-center text-base">
              The KingdomFlow website is made for a desktop, laptop or tablet. On your phone, please use the
              KingdomFlow app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Just reset your password? Open the app and sign in with your new password. Don&apos;t have the app
              yet? Ask your church for the link, or open KingdomFlow on a larger screen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
