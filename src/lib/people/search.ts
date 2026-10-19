// One search box for people: type a name, a mobile number, or both ("anna 99876"). Used wherever a screen
// lets someone find a member. Pure, so it is shared by the browser and the tests.

export interface Searchable {
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Only the digits of a phone number: "+91 99876-04817" becomes "919987604817". */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function fullName(person: Searchable): string {
  return (person.name ?? `${person.firstName ?? ""} ${person.lastName ?? ""}`)
    .trim()
    .toLowerCase();
}

/**
 * Whether a person matches what was typed. The text is split on spaces and EVERY word must match:
 * a word matches the name or email as plain text, or, if it has digits, the phone number by its digits
 * (so spaces, dashes, "+91" and brackets in the stored number or in what was typed do not matter).
 */
export function matchesPerson(query: string, person: Searchable): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const name = fullName(person);
  const email = (person.email ?? "").toLowerCase();
  const digits = phoneDigits(person.phone);
  return words.every((word) => {
    if (name.includes(word) || email.includes(word)) return true;
    const wanted = phoneDigits(word);
    return wanted.length > 0 && digits.includes(wanted);
  });
}
