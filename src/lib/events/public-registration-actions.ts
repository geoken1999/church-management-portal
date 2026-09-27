"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRegistrationPassEmail } from "@/lib/events/registration-pass";
import { eventVenueLabel, eventJoinLink } from "@/lib/events/location";
import type { EventMeetingMode } from "@/types/database";

export interface PublicEventRegistrationState {
  error?: string;
  success?: boolean;
}

// Anonymous visitor submission from the public /events/register/[token]
// page — no requireUser(), field validation happens server-side in the
// submit_event_registration RPC, same shape as submitPublicForm/
// submitWidgetResponse. The pass email is sent from here (not the RPC —
// SQL can't send email) once the registration is confirmed.
export async function registerForEvent(
  token: string,
  _prevState: PublicEventRegistrationState,
  formData: FormData,
): Promise<PublicEventRegistrationState> {
  const fieldKeys = String(formData.get("__fieldKeys") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const checkboxKeys = new Set(
    String(formData.get("__checkboxKeys") ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );

  const answers: Record<string, string | boolean> = {};
  for (const key of fieldKeys) {
    if (checkboxKeys.has(key)) {
      answers[key] = formData.get(key) === "on";
      continue;
    }
    const raw = formData.get(key);
    if (raw !== null) {
      const value = String(raw).trim();
      if (value) answers[key] = value;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_event_registration", { token, answers }).maybeSingle();

  if (error) {
    return { error: error.message || "Couldn't complete your registration. Please try again." };
  }
  if (!data) {
    return { error: "Couldn't complete your registration. Please try again." };
  }

  // Best-effort — a failure here shouldn't undo a successful registration
  // (the RPC above already committed), so the visitor still sees success
  // even if the pass email itself has trouble; that failure is logged
  // separately inside sendRegistrationPassEmail.
  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("event_registrations")
    .select(
      "email, answers, event_id, events(title, description, start_at, end_at, meeting_mode, meeting_link, venue, map_link, contact_name, contact_phone, organization_id, registration_pass_color, registration_pass_message, registration_pass_background_url, branches(name), organizations(name))",
    )
    .eq("id", data.registration_id)
    .maybeSingle();

  if (registration) {
    const event = registration.events as {
      title: string;
      description: string | null;
      start_at: string;
      end_at: string | null;
      meeting_mode: EventMeetingMode;
      meeting_link: string | null;
      venue: string | null;
      map_link: string | null;
      contact_name: string | null;
      contact_phone: string | null;
      organization_id: string;
      registration_pass_color: string;
      registration_pass_message: string | null;
      registration_pass_background_url: string | null;
      branches: { name: string } | null;
      organizations: { name: string } | null;
    } | null;

    if (event) {
      const venueLabel = eventVenueLabel({ meeting_mode: event.meeting_mode, venue: event.venue, branchName: event.branches?.name });
      const joinLink = eventJoinLink(event);

      const answersRecord = registration.answers as Record<string, unknown>;
      const recipientName = typeof answersRecord.name === "string" ? answersRecord.name : null;

      await sendRegistrationPassEmail({
        organizationId: event.organization_id,
        organizationName: event.organizations?.name ?? "Your church",
        to: registration.email,
        recipientName,
        eventId: registration.event_id,
        eventTitle: event.title,
        eventDescription: event.description,
        startAt: event.start_at,
        endAt: event.end_at,
        venueLabel,
        mapLink: event.map_link,
        joinLink,
        contactName: event.contact_name,
        contactPhone: event.contact_phone,
        confirmationCode: data.confirmation_code,
        passColor: event.registration_pass_color,
        passMessage: event.registration_pass_message,
        backgroundUrl: event.registration_pass_background_url,
      });
    }
  }

  return { success: true };
}
