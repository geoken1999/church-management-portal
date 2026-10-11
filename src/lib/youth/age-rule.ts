// The youth age rule: an inclusive age range, in whole years. Pure, so the
// card, the save action and the tests share one definition; the database
// does the actual age arithmetic (see sync_youth_for_org, migration 0140).
export const YOUTH_AGE_MIN = 0;
export const YOUTH_AGE_MAX = 100;

export interface YouthAgeRule {
  from: number;
  to: number;
}

// Reads the two fields of the form, or says what's wrong. Both blank (or a
// null rule) means "turn the rule off".
export function parseYouthAgeRule(rawFrom: unknown, rawTo: unknown): { rule: YouthAgeRule | null; error?: undefined } | { rule?: undefined; error: string } {
  const blank = (value: unknown) => value === null || value === undefined || String(value).trim() === "";
  if (blank(rawFrom) && blank(rawTo)) return { rule: null };
  if (blank(rawFrom) || blank(rawTo)) return { error: "Enter both a from age and a to age." };

  const from = Number(rawFrom);
  const to = Number(rawTo);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return { error: "Ages must be whole numbers." };
  if (from < YOUTH_AGE_MIN || to > YOUTH_AGE_MAX) return { error: `Ages must be between ${YOUTH_AGE_MIN} and ${YOUTH_AGE_MAX}.` };
  if (from > to) return { error: "The from age can't be higher than the to age." };
  return { rule: { from, to } };
}

// Age in whole years on a given day. Used only for previews and tests; the
// database decides who actually belongs to the roster.
export function ageOn(dateOfBirth: string, today: Date): number {
  const dob = new Date(dateOfBirth);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isInYouthAgeRange(dateOfBirth: string | null, rule: YouthAgeRule | null, today: Date): boolean {
  if (!dateOfBirth || !rule) return false;
  const age = ageOn(dateOfBirth, today);
  return age >= rule.from && age <= rule.to;
}
