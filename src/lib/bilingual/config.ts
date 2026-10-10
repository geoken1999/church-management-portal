import { LOCALE_LABELS, isAppLocale, type AppLocale } from "@/lib/i18n/config";

// A form that shows two languages at once ("Name / नाम"). `source` is the
// language the admin wrote the form in (and the one shown first); `target`
// is the second language shown after the slash. `translations` maps each
// piece of the admin's text to its translation, so rendering is a lookup
// and unchanged text never has to be translated again. Pure, so the
// builder UI, the save actions and the public pages all share it.
export interface BilingualConfig {
  source: AppLocale;
  target: AppLocale;
  translations: Record<string, string>;
}

export const MAX_TRANSLATION_STRINGS = 200;
export const MAX_TRANSLATED_LENGTH = 1000;

export function languageLabel(locale: AppLocale): string {
  return LOCALE_LABELS[locale];
}

// Untrusted JSON (a hidden form field, or a stored column) to a clean
// config, or null for "not bilingual". Two different, supported languages
// are required; translations are trimmed, length-capped and limited in
// number so a stored value can't grow without bound.
export function sanitizeBilingual(input: unknown): BilingualConfig | null {
  if (!input || typeof input !== "object") return null;
  const { source, target, translations } = input as Record<string, unknown>;
  if (typeof source !== "string" || typeof target !== "string") return null;
  if (!isAppLocale(source) || !isAppLocale(target) || source === target) return null;

  const clean: Record<string, string> = {};
  if (translations && typeof translations === "object") {
    for (const [key, value] of Object.entries(translations as Record<string, unknown>)) {
      if (Object.keys(clean).length >= MAX_TRANSLATION_STRINGS) break;
      if (typeof value !== "string") continue;
      const k = key.trim();
      const v = value.trim().slice(0, MAX_TRANSLATED_LENGTH);
      if (k && v) clean[k] = v;
    }
  }
  return { source, target, translations: clean };
}

// "Name / नाम". Falls back to the plain text when there is no translation
// yet (or it is identical, e.g. a number or a proper noun).
export function bilingualText(text: string, config: BilingualConfig | null | undefined): string {
  if (!config) return text;
  const translated = config.translations[text.trim()];
  if (!translated || translated.trim().toLowerCase() === text.trim().toLowerCase()) return text;
  return `${text} / ${translated}`;
}

// Every distinct, non-empty string of admin-written text on a form that
// should be translated: title, description, field labels and dropdown
// options.
export function collectTranslatableStrings(input: {
  title?: string | null;
  description?: string | null;
  fields?: { label: string; options?: string[] | null }[] | null;
  extra?: (string | null | undefined)[];
}): string[] {
  const seen = new Set<string>();
  const add = (value: string | null | undefined) => {
    const v = value?.trim();
    if (v && !/^[\d\s.,:;+\-/()]+$/.test(v)) seen.add(v);
  };
  add(input.title);
  add(input.description);
  for (const field of input.fields ?? []) {
    add(field.label);
    for (const option of field.options ?? []) add(option);
  }
  for (const value of input.extra ?? []) add(value);
  return [...seen];
}
