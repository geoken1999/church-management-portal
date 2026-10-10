"use client";

import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PublicEventRegistrationForm } from "@/components/events/PublicEventRegistrationForm";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useBilingualLabel } from "@/lib/bilingual/use-bilingual";
import { formatInTimezone } from "@/lib/organizations/timezone";
import { bilingualText, type BilingualConfig } from "@/lib/bilingual/config";
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
  bilingual?: BilingualConfig | null;
  // The event's own contact person, shown when registration isn't open so
  // a visitor knows who to ask instead of hitting a dead end.
  contact_name?: string | null;
  contact_phone?: string | null;
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
  const bt = useBilingualLabel(data.bilingual ?? null);

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
      ? bt((d) => d.publicEvent.cancelled)
      : data.status === "completed"
        ? bt((d) => d.publicEvent.completed)
        : data.status === "pending"
          ? bt((d) => d.publicEvent.pending)
          : null;
  const hasContact = Boolean(data.contact_name?.trim() || data.contact_phone?.trim());

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
            <CardTitle className="font-heading text-2xl">{bilingualText(data.title, data.bilingual)}</CardTitle>
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
            {data.description && <p className="text-sm text-muted-foreground">{bilingualText(data.description, data.bilingual)}</p>}
          </CardHeader>
          <CardContent>
            {!data.is_open ? (
              <div className="space-y-3 rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                <p>
                  {statusMessage ??
                    (isFull ? bt((d) => d.publicEvent.full) : isClosed ? bt((d) => d.publicEvent.closed) : bt((d) => d.publicEvent.closingSoon))}
                </p>
                {hasContact && (
                  <div className="border-t border-border pt-3 text-foreground">
                    <p className="text-xs text-muted-foreground">{bt((d) => d.publicEvent.contactHeading)}</p>
                    {data.contact_name?.trim() && <p className="font-medium">{data.contact_name.trim()}</p>}
                    {data.contact_phone?.trim() && (
                      <a href={`tel:${data.contact_phone.replace(/[^\d+]/g, "")}`} className="font-medium text-primary hover:underline">
                        {data.contact_phone.trim()}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {data.spots_remaining !== null && (
                  <p className="mb-4 text-xs text-muted-foreground">{t.publicEvent.spotsRemaining(data.spots_remaining)}</p>
                )}
                {/* PublicEventRegistrationForm reads ?payment= via useSearchParams
                    (set when PayU redirects back here) — same Suspense
                    requirement as LoginForm/SignupForm. */}
                <Suspense fallback={null}>
                  <PublicEventRegistrationForm token={token} fields={data.registration_fields ?? []} bilingual={data.bilingual ?? null} />
                </Suspense>
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
