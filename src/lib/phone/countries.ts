// No "server-only" guard — the country <Select> options are needed in
// Client Components (Branch form, Church Profile form), and none of this
// touches secrets.
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";

export interface CountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

let cachedOptions: CountryOption[] | null = null;

// Built from libphonenumber-js's own country list rather than a
// hand-maintained one, so it can't silently drift out of sync with what
// normalizePhoneNumber() actually supports.
export function getCountryOptions(): CountryOption[] {
  if (cachedOptions) return cachedOptions;

  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  cachedOptions = getCountries()
    .map((code) => ({
      code,
      name: displayNames.of(code) ?? code,
      callingCode: getCountryCallingCode(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return cachedOptions;
}

export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
