import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/plans/dal", () => ({ checkFeatureCap: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/push/member-notice", () => ({ notifyMember: vi.fn() }));
vi.mock("@/lib/notifications/create", () => ({ createNotificationForWebhook: vi.fn() }));

import { validateFamilyRequestInput, MAX_FAMILY_PEOPLE } from "./requests";

const ok = { name: "Kennedy family", requesterRelationship: "Father", people: [{ memberId: "a", relationship: "Wife" }] };

describe("validateFamilyRequestInput", () => {
  it("accepts a name, a role and related people", () => {
    expect(validateFamilyRequestInput(ok)).toBeNull();
  });
  it("needs a name and the requester's role", () => {
    expect(validateFamilyRequestInput({ ...ok, name: " a " })).toMatch(/name/);
    expect(validateFamilyRequestInput({ ...ok, requesterRelationship: "" })).toMatch(/what you are/);
  });
  it("rejects a person twice or without a relationship", () => {
    expect(validateFamilyRequestInput({ ...ok, people: [ok.people[0], ok.people[0]] })).toMatch(/only once/);
    expect(validateFamilyRequestInput({ ...ok, people: [{ memberId: "a", relationship: "" }] })).toMatch(/related/);
  });
  it("caps the number of people", () => {
    const many = Array.from({ length: MAX_FAMILY_PEOPLE + 1 }, (_, i) => ({ memberId: `m${i}`, relationship: "Child" }));
    expect(validateFamilyRequestInput({ ...ok, people: many })).toMatch(/up to/);
  });
});
