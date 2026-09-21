// No "server-only" guard — the composer (a Client Component) needs the
// segment counter, and the send action needs the phone normalizer, so
// this has to be importable from both.
import { parsePhoneNumberFromString, isSupportedCountry, type CountryCode } from "libphonenumber-js";

// Basic GSM-7 charset (the ~128 characters that cost 1 septet each).
// Anything outside this set (emoji, most accented characters, curly
// quotes, etc.) forces UCS-2 encoding, which drops the per-segment limit
// from 160 to 70 characters — a common surprise cause of extra SMS
// segments/cost, worth flagging in the composer.
const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Extension characters cost 2 septets each (escape + character).
const GSM7_EXTENDED = "^{}\\[~]|€";

function isGsm7(text: string): boolean {
  return Array.from(text).every((char) => GSM7_BASIC.includes(char) || GSM7_EXTENDED.includes(char));
}

export interface SmsSegmentInfo {
  length: number;
  encoding: "GSM-7" | "UCS-2";
  segmentSize: number;
  segments: number;
}

export function getSmsSegmentInfo(body: string): SmsSegmentInfo {
  const gsm7 = isGsm7(body);
  const encoding = gsm7 ? "GSM-7" : "UCS-2";

  // Extended GSM-7 characters count as 2 septets — approximate by counting
  // them twice rather than building a full septet-accurate encoder, which
  // is precise enough for an informational counter (Twilio bills the
  // exact count; this just warns before sending).
  const length = gsm7
    ? Array.from(body).reduce((sum, char) => sum + (GSM7_EXTENDED.includes(char) ? 2 : 1), 0)
    : Array.from(body).length;

  const singleLimit = gsm7 ? 160 : 70;
  const concatLimit = gsm7 ? 153 : 67;
  const segments = length <= singleLimit ? (length === 0 ? 0 : 1) : Math.ceil(length / concatLimit);

  return { length, encoding, segmentSize: singleLimit, segments };
}

// Twilio requires E.164 (e.g. +14155552671). Congregant-entered numbers
// are rarely in that format — this uses libphonenumber-js with the
// recipient's resolved country (their branch's, falling back to the
// org's — see resolvePhoneCountry) to parse national-format numbers
// correctly instead of assuming any one country. A number already
// written with a "+" country code parses fine even without one.
export function normalizePhoneNumber(raw: string, countryCode?: string | null): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const country = countryCode && isSupportedCountry(countryCode) ? (countryCode as CountryCode) : undefined;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, country);
    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
    // Malformed input (e.g. an unsupported country code) — fall through
    // to null rather than letting parsePhoneNumberFromString throw.
  }

  return null;
}

// A branch's own country wins; if it doesn't have one (or the member has
// no branch), fall back to the organization's — the "ask the church
// profile" fallback the SMS composer surfaces when both are missing.
export function resolvePhoneCountry(branchCountry: string | null | undefined, orgCountry: string | null | undefined): string | null {
  return branchCountry || orgCountry || null;
}
