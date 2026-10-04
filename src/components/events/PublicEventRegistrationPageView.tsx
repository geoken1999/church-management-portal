"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicEventRegistrationForm } from "@/components/events/PublicEventRegistrationForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { formatInTimezone } from "@/lib/organizations/timezone";
import type { EventRegistrationField, EventStatus } from "@/types/database";

export interface PublicEventRegistrationData {
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  registration_fields: EventRegistrationField[] | null;
  registration_closes_at: string | null;
  spots_remaining: number | null;
  is_open: boolean;
  status: EventStatus;
  organization_name: string;
  organization_logo_url: string | null;
  organization_timezone: string;
}

function NotFoundCard() {
  const { t } = useLocale();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <Card size="lg" className="relative w-full max-w-md rounded-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">{t.common.linkNotFound}</CardTitle>
          <CardDescription>{t.publicEvent.notFoundDescription}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function EventContent({ token, data }: { token: string; data: PublicEventRegistrationData }) {
  const { t } = useLocale();

  // is_open (from the RPC) is the authoritative gate — it already accounts
  // for the event's status (migration 0076), capacity, registration_closes_at,
  // AND closing 1 hour before the event starts (migration 0070). isFull/
  // isClosed/statusMessage here are only used to pick which message to show
  // when it's false, not to decide whether the form itself is allowed to
  // render.
  const isFull = data.spots_remaining !== null && data.spots_remaining <= 0;
  const isClosed = data.registration_closes_at ? new Date(data.registration_closes_at) < new Date() : false;
  const statusMessage =
    data.status === "cancelled"
      ? t.publicEvent.cancelled
      : data.status === "completed"
        ? t.publicEvent.completed
        : data.status === "pending"
          ? t.publicEvent.pending
          : null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
        aria-hidden
      />

      <div className="relative w-full max-w-xl">
        <div className="mb-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <PublicBrandHeader logoUrl={data.organization_logo_url} name={data.organization_name} />

        <Card size="lg" className="rounded-2xl shadow-lg md:[--card-spacing:--spacing(9)]">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">{data.title}</CardTitle>
            <CardDescription className="text-base">
              {/* A fixed locale AND a fixed (the org's own) timeZone, not
                  undefined for either — this renders inside a Client
                  Component that's server-rendered then hydrated, so letting
                  either default to "whatever the runtime's own timezone/
                  locale happens to be" would format differently on the
                  server (Node) vs. the browser and trip a hydration
                  mismatch, on top of just showing the wrong time to anyone
                  not in the org's own timezone. */}
              {formatInTimezone(data.start_at, data.organization_timezone, { dateStyle: "full", timeStyle: "short" }, "en-US")}
            </CardDescription>
            {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
          </CardHeader>
          <CardContent>
            {!data.is_open ? (
              <p className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                {statusMessage ?? (isFull ? t.publicEvent.full : isClosed ? t.publicEvent.closed : t.publicEvent.closingSoon)}
              </p>
            ) : (
              <>
                {data.spots_remaining !== null && (
                  <p className="mb-4 text-xs text-muted-foreground">{t.publicEvent.spotsRemaining(data.spots_remaining)}</p>
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

export function PublicEventRegistrationPageView({
  token,
  data,
}: {
  token: string;
  data: PublicEventRegistrationData | null;
}) {
  return <PublicLocaleProvider>{data ? <EventContent token={token} data={data} /> : <NotFoundCard />}</PublicLocaleProvider>;
}
