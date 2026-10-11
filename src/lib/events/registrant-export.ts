"use server";

import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { buildRegistrantTable, containsNonLatin } from "@/lib/events/registrant-table";
import { buildRegistrantsPdf, buildRegistrantsWorkbook } from "@/lib/events/registrant-files";
import type { EventRegistration, EventRegistrationField } from "@/types/database";

export interface ExportRegistrantsResult {
  error?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
  // The file was produced, with a caveat the admin should know.
  warning?: string;
}

// An event's registrants as Excel or PDF: when each registered, every answer
// on the form, and whether (and when) they checked in. Read access to
// Events is what allows it, the same bar as seeing the Registrants tab.
export async function exportEventRegistrants(eventId: string, format: "excel" | "pdf"): Promise<ExportRegistrantsResult> {
  await requireUser();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("title, start_at, organization_id, registration_fields, payment_required, organizations(name, timezone)")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { error: "That event could not be found." };

  const access = await checkTabAccess(event.organization_id, "events", "read");
  if (!access.ok) return { error: access.message };

  const { data: registrations } = await admin.from("event_registrations").select("*").eq("event_id", eventId);
  const organization = event.organizations as { name: string; timezone: string } | null;
  const timeZone = organization?.timezone || DEFAULT_TIMEZONE;

  const table = buildRegistrantTable({
    fields: (event.registration_fields ?? []) as EventRegistrationField[],
    registrations: (registrations ?? []) as EventRegistration[],
    timeZone,
    paymentRequired: event.payment_required,
  });
  if (table.rows.length === 0) return { error: "No one has registered yet, so there is nothing to export." };

  const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";

  if (format === "excel") {
    return {
      base64: Buffer.from(buildRegistrantsWorkbook(table, "Registrants")).toString("base64"),
      filename: `${safeTitle}-registrants.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  const all = (registrations ?? []) as EventRegistration[];
  const pdf = buildRegistrantsPdf(table, {
    organizationName: organization?.name ?? "",
    eventTitle: event.title,
    eventDate: new Date(event.start_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone }),
    registered: all.filter((r) => r.status === "confirmed").length,
    checkedIn: all.filter((r) => r.status === "checked_in").length,
    cancelled: all.filter((r) => r.status === "cancelled").length,
  });
  return {
    base64: Buffer.from(pdf).toString("base64"),
    filename: `${safeTitle}-registrants.pdf`,
    mimeType: "application/pdf",
    warning: containsNonLatin(table) ? "Some text uses a script the PDF can't draw (such as Hindi or Tamil) and may not show correctly. Use the Excel export for those." : undefined,
  };
}
