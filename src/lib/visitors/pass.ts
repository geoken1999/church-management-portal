import { zonedTimeToUtc } from "@/lib/organizations/timezone";

// Letters and digits that can't be mistaken for each other when read aloud or typed (no 0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generatePassCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** The moment a pass issued for [visitDate] (the church's own calendar day, YYYY-MM-DD) stops working: the end of that day. */
export function passValidUntil(visitDate: string, timeZone: string): Date {
  return zonedTimeToUtc(`${visitDate}T23:59`, timeZone);
}

export type PassState = "valid" | "entered" | "expired";

/** An entered pass is used up for the day; otherwise it is good until its end time. */
export function passState(pass: { valid_until: string; entered_at: string | null }, now: Date = new Date()): PassState {
  if (pass.entered_at) return "entered";
  return new Date(pass.valid_until).getTime() > now.getTime() ? "valid" : "expired";
}
