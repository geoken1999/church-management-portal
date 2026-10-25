import type { Metadata } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildQrPng } from "@/lib/events/registration-pass";
import { formatInTimezone } from "@/lib/organizations/timezone";
import { getSiteUrl } from "@/lib/site-url";
import { admitVisitor } from "@/lib/visitors/actions";
import { mayAdmitVisitors, visitorPassFor } from "@/lib/visitors/service";
import { DEFAULT_CHURCH_LOGO, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Visitor pass | KingdomFlow",
  robots: { index: false, follow: false },
};

// A guest's temporary entrance pass, opened from the WhatsApp message (or straight after the visitor form). The QR code
// is this page's own address, so the church's team scanning it with a phone camera lands here; signed in as team, they
// also see the "Let them in" button.
export default async function VisitorPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pass = await visitorPassFor(token);

  if (!pass) {
    return (
      <PublicLocaleProvider>
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
          <h1 className="font-heading text-xl font-bold">Pass not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This link isn&apos;t valid. Check the message you received, or ask the team at the entrance.</p>
        </div>
      </PublicLocaleProvider>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const team = user ? await mayAdmitVisitors(pass.organizationId, user.id) : false;

  const qr = (await buildQrPng(`${getSiteUrl()}/visitor-pass/${token}`, pass.organizationId, 560)).toString("base64");
  const until = formatInTimezone(pass.validUntil, pass.timezone, { dateStyle: "medium", timeStyle: "short" }, "en-IN");
  const enteredAt = pass.enteredAt ? formatInTimezone(pass.enteredAt, pass.timezone, { timeStyle: "short" }, "en-IN") : null;

  const status =
    pass.state === "valid"
      ? { icon: <CheckCircle2 className="size-5" />, text: `Valid until ${until}`, tone: "bg-primary/10 text-primary" }
      : pass.state === "entered"
        ? { icon: <CheckCircle2 className="size-5" />, text: `Entered at ${enteredAt}`, tone: "bg-muted text-foreground" }
        : { icon: <XCircle className="size-5" />, text: "This pass has expired", tone: "bg-destructive/10 text-destructive" };

  return (
    <PublicLocaleProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div className="space-y-1 px-6 pt-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pass.logoUrl ?? DEFAULT_CHURCH_LOGO} alt="" width={40} height={40} className="mx-auto size-10 rounded-lg object-cover" />
            <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{pass.churchName}</p>
            <h1 className="font-heading text-xl font-bold">Visitor pass</h1>
            <p className="text-sm text-muted-foreground">{pass.firstName ? `${pass.firstName}, ` : ""}show this at the entrance.</p>
          </div>

          <div className="px-6 py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${qr}`} alt="Entrance QR code" className={`mx-auto aspect-square w-full max-w-64 rounded-lg ${pass.state === "valid" ? "" : "opacity-30"}`} />
            <p className="mt-3 text-center font-mono text-2xl font-bold tracking-[0.3em]">{pass.code}</p>
          </div>

          <div className={`flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium ${status.tone}`}>
            {status.icon}
            {status.text}
          </div>

          {team && (
            <div className="space-y-2 border-t border-border px-6 py-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" /> You are signed in as {pass.churchName}&apos;s team
              </p>
              {pass.state === "valid" ? (
                <form action={admitVisitor}>
                  <input type="hidden" name="token" value={token} />
                  <Button type="submit" className="w-full">
                    Let them in
                  </Button>
                </form>
              ) : (
                <p className="text-sm font-medium">{pass.state === "entered" ? "Already used today." : "Don't admit: expired."}</p>
              )}
            </div>
          )}
        </div>
        <PublicPoweredByFooter />
      </div>
    </PublicLocaleProvider>
  );
}
