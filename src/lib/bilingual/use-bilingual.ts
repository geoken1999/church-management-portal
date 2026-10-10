"use client";

import { useLocale, dictionaryFor } from "@/lib/i18n/LocaleContext";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { BilingualConfig } from "@/lib/bilingual/config";

// For text the app itself translates (the join form's built-in questions):
// "First name / पहला नाम" built from the two dictionaries directly, so it
// needs no AI and never goes stale. With no bilingual config it is just the
// visitor's own language, as before.
export function useBilingualLabel(config: BilingualConfig | null): (select: (dictionary: Dictionary) => string) => string {
  const { t } = useLocale();
  return (select) => {
    if (!config) return select(t);
    const first = select(dictionaryFor(config.source));
    const second = select(dictionaryFor(config.target));
    return first.trim().toLowerCase() === second.trim().toLowerCase() ? first : `${first} / ${second}`;
  };
}
