// Who has a special day today. Pure, so the matching rule is testable.

export interface SpecialDayMember {
  id: string;
  first_name: string;
  auth_user_id: string | null;
  date_of_birth: string | null;
  wedding_date: string | null;
}

export type SpecialDayKind = "birthday" | "anniversary";

export interface SpecialDayHit {
  member: SpecialDayMember;
  kind: SpecialDayKind;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// A date ("YYYY-MM-DD") falls on today's month and day. A 29 February date is
// celebrated on 28 February in years without one.
export function isOnThisDay(date: string | null, todayKey: string): boolean {
  if (!date) return false;
  const [year, month, day] = todayKey.split("-").map(Number);
  const [, m, d] = date.split("-").map(Number);
  if (!m || !d) return false;
  if (m === 2 && d === 29 && !isLeapYear(year)) return month === 2 && day === 28;
  return m === month && d === day;
}

// Only members with an app account can be pushed to.
export function findSpecialDays(members: SpecialDayMember[], todayKey: string): SpecialDayHit[] {
  const hits: SpecialDayHit[] = [];
  for (const member of members) {
    if (!member.auth_user_id) continue;
    if (isOnThisDay(member.date_of_birth, todayKey)) hits.push({ member, kind: "birthday" });
    if (isOnThisDay(member.wedding_date, todayKey)) hits.push({ member, kind: "anniversary" });
  }
  return hits;
}

export function specialDayMessage(kind: SpecialDayKind, firstName: string, churchName: string): { title: string; body: string } {
  const name = firstName.trim() || "friend";
  return kind === "birthday"
    ? { title: `Happy birthday, ${name}! 🎂`, body: `${churchName} wishes you a blessed birthday.` }
    : { title: `Happy anniversary, ${name}! 💐`, body: `${churchName} wishes you a blessed wedding anniversary.` };
}
