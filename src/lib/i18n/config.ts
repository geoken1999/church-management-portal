// No "server-only" guard — read from both Server Components (resolving a
// stored preference) and Client Components (the language switchers).
export const SUPPORTED_LOCALES = ["en", "ta", "hi"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  ta: "தமிழ்",
  hi: "हिन्दी",
};

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return Boolean(value) && (SUPPORTED_LOCALES as readonly string[]).includes(value as string);
}

export function toAppLocale(value: string | null | undefined): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}
