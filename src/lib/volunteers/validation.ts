export interface VolunteerFieldErrors {
  memberId?: string;
  role?: string;
  joinedOn?: string;
}

export interface VolunteerInput {
  memberId: string;
  role: string;
  team: string;
  joinedOn: string;
  status: string;
}

export function validateVolunteer(input: VolunteerInput): VolunteerFieldErrors {
  const errors: VolunteerFieldErrors = {};
  if (!input.memberId) errors.memberId = "Select a member.";
  if (input.role.trim().length < 2) errors.role = "Enter what they volunteer as (at least 2 characters).";
  if (input.joinedOn && Number.isNaN(Date.parse(input.joinedOn))) errors.joinedOn = "Enter a valid date.";
  return errors;
}

export const VOLUNTEER_STATUSES = ["active", "inactive"] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];

export function parseVolunteerStatus(value: string): VolunteerStatus {
  return value === "inactive" ? "inactive" : "active";
}
