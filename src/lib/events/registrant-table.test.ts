import { describe, it, expect } from "vitest";
import { buildRegistrantTable, containsNonLatin } from "./registrant-table";
import type { EventRegistration, EventRegistrationField } from "@/types/database";

const field = (key: string, label: string, field_type: EventRegistrationField["field_type"] = "text"): EventRegistrationField => ({ key, label, field_type, options: null, required: true, unique: false });

const reg = (over: Partial<EventRegistration>): EventRegistration => ({
  id: "1",
  event_id: "e",
  organization_id: "o",
  email: "a@b.com",
  phone: null,
  answers: {},
  confirmation_code: "EVT-AAA",
  pass_token: "11111111-1111-1111-1111-111111111111",
  status: "confirmed",
  checked_in_at: null,
  last_reminder_occurrence_date: null,
  last_reminder_sent_at: null,
  payment_status: "not_required",
  payment_amount: null,
  paid_at: null,
  created_at: "2026-10-10T04:30:00Z",
  ...over,
});

describe("buildRegistrantTable", () => {
  const fields = [field("name", "Name"), field("age", "Age", "number")];

  it("lists form fields in order, with date and time in the church's timezone", () => {
    const table = buildRegistrantTable({ fields, timeZone: "Asia/Kolkata", paymentRequired: false, registrations: [reg({ answers: { name: "Ann", age: 30 } })] });
    expect(table.headers).toEqual(["#", "Registered on", "Registered at", "Name", "Age", "Email", "Confirmation code", "Status", "Checked in on", "Checked in at"]);
    expect(table.rows[0].slice(0, 6)).toEqual(["1", "10 Oct 2026", "10:00 am", "Ann", "30", "a@b.com"]);
  });

  it("shows check-in status and when, oldest registration first", () => {
    const table = buildRegistrantTable({
      fields,
      timeZone: "Asia/Kolkata",
      paymentRequired: false,
      registrations: [
        reg({ id: "2", created_at: "2026-10-11T04:30:00Z", confirmation_code: "EVT-LATE", status: "checked_in", checked_in_at: "2026-11-21T04:00:00Z" }),
        reg({ id: "1", created_at: "2026-10-09T04:30:00Z", confirmation_code: "EVT-EARLY" }),
      ],
    });
    expect(table.rows.map((r) => r[6])).toEqual(["EVT-EARLY", "EVT-LATE"]);
    expect(table.rows[1].slice(7)).toEqual(["Checked in", "21 Nov 2026", "09:30 am"]);
    expect(table.rows[0].slice(7)).toEqual(["Registered", "", ""]);
  });

  it("does not repeat Email when the form already has an email question, and adds payment columns when paid", () => {
    const table = buildRegistrantTable({
      fields: [field("email", "Email", "email")],
      timeZone: "Asia/Kolkata",
      paymentRequired: true,
      registrations: [reg({ answers: { email: "x@y.com" }, payment_status: "paid", payment_amount: 500 })],
    });
    expect(table.headers.filter((h) => h === "Email")).toHaveLength(1);
    expect(table.rows[0].slice(-2)).toEqual(["Paid", "500"]);
  });
});

describe("containsNonLatin", () => {
  it("flags Hindi or Tamil text but not plain English", () => {
    expect(containsNonLatin({ headers: ["Name"], rows: [["Ann"]] })).toBe(false);
    expect(containsNonLatin({ headers: ["Name / नाम"], rows: [] })).toBe(true);
  });
});
