import { randomInt } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O — easy to misread when copied by hand
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

// Generates a password that satisfies validatePassword() (8+ chars, upper,
// lower, digit) and avoids visually ambiguous characters, since these are
// meant to be read off a screen and typed in by someone else.
export function generatePassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  const rest = Array.from({ length: length - required.length }, () => pick(ALL));
  const chars = [...required, ...rest];

  // Fisher-Yates shuffle so the guaranteed characters aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
