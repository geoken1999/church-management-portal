import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildQrPng } from "@/lib/events/registration-pass";
import { eventJoinLink, eventVenueLabel } from "@/lib/events/location";
import { formatInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { DEFAULT_CHURCH_LOGO } from "@/components/PublicBrandHeader";
import type { EventMeetingMode } from "@/types/database";

// A registrant's pass, opened from the "View pass" button on the WhatsApp
// message. The token in the link is unguessable (migration 0135); it is not
// the short confirmation code. Not indexed.
export const metadata: Metadata = {
  title: "Your event pass | KingdomFlow",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-heading text-xl font-bold">Pass not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This link isn&apos;t valid. Check the message you received, or contact the organizer.</p>
    </div>
  );
}

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return <NotFound />;

  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("event_registrations")
    .select(
      "answers, confirmation_code, status, organization_id, events(title, start_at, meeting_mode, meeting_link, venue, map_link, contact_name, contact_phone, registration_pass_color, branches(name), organizations(name, logo_url, timezone))",
    )
    .eq("pass_token", token)
    .maybeSingle();
  if (!registration) return <NotFound />;

  const event = registration.events as {
    title: string;
    start_at: string;
    meeting_mode: EventMeetingMode;
    meeting_link: string | null;
    venue: string | null;
    map_link: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    registration_pass_color: string;
    branches: { name: string } | null;
    organizations: { name: string; logo_url: string | null; timezone: string } | null;
  } | null;
  if (!event) return <NotFound />;

  const answers = (registration.answers ?? {}) as Record<string, unknown>;
  const name = typeof answers.name === "string" ? answers.name : null;
  const timeZone = event.organizations?.timezone || DEFAULT_TIMEZONE;
  const when = formatInTimezone(event.start_at, timeZone, { dateStyle: "full", timeStyle: "short" }, "en-IN");
  const venue = eventVenueLabel({ meeting_mode: event.meeting_mode, venue: event.venue, branchName: event.branches?.name });
  const joinLink = eventJoinLink(event);
  const color = /^#[0-9a-f]{6}$/i.test(event.registration_pass_color) ? event.registration_pass_color : "#7c3aed";
  const cancelled = registration.status === "cancelled";

  // The QR carries the confirmation code, same as the emailed pass, so the
  // door scanner and manual lookup work identically.
  const qr = await buildQrPng(registration.confirmation_code, registration.organization_id, 640);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="h-16" style={{ background: color }} />
        <div className="space-y-1 px-6 pt-5">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.organizations?.logo_url ?? DEFAULT_CHURCH_LOGO} alt="" width={28} height={28} className="size-7 rounded-md object-cover" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{event.organizations?.name}</p>
          </div>
          <h1 className="font-heading text-xl font-bold leading-snug">{event.title}</h1>
          <p className="text-sm text-muted-foreground">{when}</p>
          {venue && (
            <p className="text-sm text-muted-foreground">
              {event.map_link ? (
                <a href={event.map_link} className="underline">
                  📍 {venue}
                </a>
              ) : (
                <>📍 {venue}</>
              )}
            </p>
          )}
          {joinLink && (
            <p className="text-sm">
              <a href={joinLink} className="text-primary underline">
                🔗 Join online
              </a>
            </p>
          )}
        </div>

        <div className="mx-6 my-5 border-t-2 border-dashed border-border" />

        <div className="space-y-4 px-6 pb-6 text-center">
          {name && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Registered to</p>
              <p className="text-lg font-semibold">{name}</p>
            </div>
          )}
          {cancelled ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">This registration was cancelled, so the pass is no longer valid.</p>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${qr.toString("base64")}`} alt="QR code for check-in" width={256} height={256} className="mx-auto size-64 rounded-xl border border-border bg-white p-2" />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmation code</p>
                <p className="text-2xl font-bold tracking-widest" style={{ color }}>
                  {registration.confirmation_code}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Show this QR code at check-in.{registration.status === "checked_in" ? " You've already checked in." : ""}</p>
            </>
          )}
          {(event.contact_name || event.contact_phone) && (
            <p className="text-xs text-muted-foreground">
              Questions? {event.contact_name}
              {event.contact_name && event.contact_phone ? " · " : ""}
              {event.contact_phone && (
                <a href={`tel:${event.contact_phone.replace(/[^\d+]/g, "")}`} className="text-primary underline">
                  {event.contact_phone}
                </a>
              )}
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-muted-foreground">via KingdomFlow</p>
    </div>
  );
}
