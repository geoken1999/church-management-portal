import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildQuickAnswers,
  type RegistrationFieldLite,
} from "@/lib/events/quick-register";
import { sendPassEmailForRegistration } from "@/lib/events/public-registration-actions";
import { pushToTeam } from "@/lib/push/team";

// One-tap registration from the member app: fills the event's form from the
// member's own details, registers them, and sends the pass (email, and
// WhatsApp when the event has it on) and the team alert exactly as the public
// registration page does.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );

  let body: { eventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId)
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );

  const { data: member } = await admin
    .from("members")
    .select("first_name, last_name, email, phone, organization_id, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member || member.status !== "active")
    return NextResponse.json(
      {
        ok: false,
        error: "No active member account is linked to this session.",
      },
      { status: 404 },
    );

  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, organization_id, registration_enabled, registration_share_token, registration_fields, payment_required",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (
    !event ||
    event.organization_id !== member.organization_id ||
    !event.registration_enabled
  ) {
    return NextResponse.json({
      ok: false,
      error: "Registration for that event isn't open.",
    });
  }
  if (event.payment_required) {
    return NextResponse.json({
      ok: false,
      error: "This event needs a payment. Please register on the event page.",
      needsWeb: true,
    });
  }

  const built = buildQuickAnswers(
    (event.registration_fields ?? []) as RegistrationFieldLite[],
    member,
  );
  if ("error" in built)
    return NextResponse.json({
      ok: false,
      error: built.error,
      needsWeb: built.error.includes("event page"),
    });

  const { data: registered, error } = await admin
    .rpc("submit_event_registration", {
      token: event.registration_share_token,
      answers: built.answers,
    })
    .maybeSingle();
  if (error || !registered)
    return NextResponse.json({
      ok: false,
      error:
        error?.message ||
        "Couldn't complete your registration. Please try again.",
    });

  await sendPassEmailForRegistration(registered.registration_id);
  await pushToTeam({
    organizationId: event.organization_id,
    tab: "events",
    title: "New event registration",
    body: `${built.answers.name ?? member.first_name} registered for ${event.title}.`,
    link: "/dashboard/events",
  });

  return NextResponse.json({ ok: true });
}
