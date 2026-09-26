import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicEventRegistrationForm } from "@/components/events/PublicEventRegistrationForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_event_registration", { token }).maybeSingle();

  return { title: data ? `Register — ${data.title} | KingdomFlow` : "Event registration | KingdomFlow" };
}

export default async function PublicEventRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_event_registration", { token }).maybeSingle();

  if (error) {
    // Never shown to the visitor — mirrors /forms/[slug]'s same reasoning
    // (e.g. migration 0067 not yet applied shouldn't look identical to a
    // genuinely missing/disabled event to whoever's debugging this).
    console.error(`get_public_event_registration(${token}) failed:`, error.message);
  }

  // is_open (from the RPC) is the authoritative gate — it already accounts
  // for the event's status (migration 0076), capacity, registration_closes_at,
  // AND closing 1 hour before the event starts (migration 0070). isFull/
  // isClosed/statusMessage here are only used to pick which message to show
  // when it's false, not to decide whether the form itself is allowed to
  // render.
  const isFull = data && data.spots_remaining !== null && data.spots_remaining <= 0;
  const isClosed = data?.registration_closes_at ? new Date(data.registration_closes_at) < new Date() : false;
  const statusMessage =
    data?.status === "cancelled"
      ? "This event has been cancelled."
      : data?.status === "completed"
        ? "This event has already taken place."
        : data?.status === "pending"
          ? "Registration for this event isn't open yet."
          : null;

  if (!data) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
        <Card size="lg" className="relative w-full max-w-md rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Registration not found</CardTitle>
            <CardDescription>This link is invalid or registration for this event isn&apos;t open right now.</CardDescription>
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

      <div className="relative w-full max-w-xl">
        <PublicBrandHeader logoUrl={data.organization_logo_url} name={data.organization_name} />

        <Card size="lg" className="rounded-2xl shadow-lg md:[--card-spacing:--spacing(9)]">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">{data.title}</CardTitle>
            <CardDescription className="text-base">
              {new Date(data.start_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
            </CardDescription>
            {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
          </CardHeader>
          <CardContent>
            {!data.is_open ? (
              <p className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                {statusMessage ??
                  (isFull
                    ? "This event is full."
                    : isClosed
                      ? "Registration for this event has closed."
                      : "Registration for this event has closed — it's starting soon.")}
              </p>
            ) : (
              <>
                {data.spots_remaining !== null && (
                  <p className="mb-4 text-xs text-muted-foreground">{data.spots_remaining} spots remaining</p>
                )}
                <PublicEventRegistrationForm token={token} fields={data.registration_fields ?? []} />
              </>
            )}
          </CardContent>
        </Card>

        <PublicPoweredByFooter />
      </div>
    </div>
  );
}
