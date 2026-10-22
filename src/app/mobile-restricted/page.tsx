import type { Metadata } from "next";
import { headers } from "next/headers";
import { Smartphone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { APP_STORE_URL } from "@/lib/app-links";
import { AppStoreButtons } from "@/components/landing/AppStoreButtons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Get the KingdomFlow app | KingdomFlow",
};

// Landed on by the middleware (src/lib/supabase/middleware.ts) whenever a phone browser requests the app itself
// (sign-in and anything past it). The public landing page, public forms and the public join link never redirect
// here. Instead of a dead end it is the download screen for the KingdomFlow app.
export default async function MobileRestrictedPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const onIphone = /iPhone|iPod|iPad/i.test(userAgent);
  const iphoneNotReady = onIphone && !APP_STORE_URL;

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
            <Smartphone className="size-6 text-primary" />
          </div>
        </div>

        <Card size="lg" className="rounded-2xl text-left shadow-lg">
          <CardHeader>
            <CardTitle className="text-center font-heading text-xl">
              Get the KingdomFlow app
            </CardTitle>
            <CardDescription className="text-center text-base">
              KingdomFlow on your phone is the app. Download it, sign in with
              the same details, and everything for your church is there.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <AppStoreButtons className="flex-col" />
            {iphoneNotReady && (
              <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
                The iPhone app is coming soon. Until then, please sign in from a
                computer or tablet.
              </p>
            )}
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                Already installed? Open the KingdomFlow app and sign in there.
              </li>
              <li>
                Just reset your password? Sign in to the app with your new
                password.
              </li>
              <li>The full website is made for a computer or tablet.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
