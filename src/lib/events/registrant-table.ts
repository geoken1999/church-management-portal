import type {
  EventRegistration,
  EventRegistrationField,
} from "@/types/database";

export interface RegistrantTable {
  headers: string[];
  rows: string[][];
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Registered",
  checked_in: "Checked in",
  cancelled: "Cancelled",
};

// An event's registrants as a flat table for Excel/PDF, oldest first:
// a row number, when they registered (date and time in the church's own
// timezone), every question on the registration form in the form's order,
// their confirmation code, whether they have checked in (and when), and
// payment details for paid events. A form that has no email question still
// gets an Email column, since a registration always has one.
export function buildRegistrantTable(input: {
  fields: EventRegistrationField[];
  registrations: EventRegistration[];
  timeZone: string;
  paymentRequired: boolean;
}): RegistrantTable {
  const { fields, timeZone, paymentRequired } = input;
  const registrations = [...input.registrations].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const hasEmailField = fields.some((f) => f.field_type === "email");

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone,
    });
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });
  const answer = (
    registration: EventRegistration,
    field: EventRegistrationField,
  ): string => {
    const value = registration.answers[field.key];
    if (value === undefined || value === null) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  const headers = [
    "#",
    "Registered on",
    "Registered at",
    ...fields.map((f) => f.label),
    ...(hasEmailField ? [] : ["Email"]),
    "Confirmation code",
    "Status",
    "Checked in on",
    "Checked in at",
    ...(paymentRequired ? ["Payment", "Amount (INR)"] : []),
  ];

  const rows = registrations.map((registration, index) => [
    String(index + 1),
    date(registration.created_at),
    time(registration.created_at),
    ...fields.map((f) => answer(registration, f)),
    ...(hasEmailField ? [] : [registration.email]),
    registration.confirmation_code,
    STATUS_LABELS[registration.status] ?? registration.status,
    registration.checked_in_at ? date(registration.checked_in_at) : "",
    registration.checked_in_at ? time(registration.checked_in_at) : "",
    ...(paymentRequired
      ? [
          registration.payment_status === "paid"
            ? "Paid"
            : registration.payment_status === "pending"
              ? "Pending"
              : "",
          registration.payment_amount != null
            ? String(registration.payment_amount)
            : "",
        ]
      : []),
  ]);

  return { headers, rows };
}

// The PDF's built-in font only has Latin characters; anything else (Hindi,
// Tamil, ...) would come out as garbage, so the export warns instead of
// silently producing it.
export function containsNonLatin(table: RegistrantTable): boolean {
  const nonLatin = /[^\u0000-ɏ -⁯₠-⃏]/;
  return [table.headers, ...table.rows].some((row) =>
    row.some((cell) => nonLatin.test(cell)),
  );
}
