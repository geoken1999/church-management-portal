// How a listed church is shown on the landing page. Pure, so it can be tested.

export interface ListedChurch {
  id: string;
  name: string;
  logoUrl: string | null;
  /** ISO 3166-1 alpha-2, e.g. "IN". */
  country: string | null;
}

/** One or two capital letters for the round badge when a church has no logo. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "?";
  const second =
    words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** "India" for "IN"; empty when the code is missing or not one the runtime knows. */
export function countryName(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(
        code.toUpperCase(),
      ) ?? ""
    );
  } catch {
    return "";
  }
}
