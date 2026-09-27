"use client";

import { createContext, useContext } from "react";
import { DICTIONARIES } from "./dictionary";
import type { AppLocale } from "./config";
import type { Dictionary } from "./dictionary";

export interface LocaleContextValue {
  locale: AppLocale;
  t: Dictionary;
  setLocale: (locale: AppLocale) => void;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

// Two concrete providers (DashboardLocaleProvider, PublicLocaleProvider)
// share this same context/hook — they only differ in WHERE the choice is
// persisted (a signed-in user's profile vs. an anonymous visitor's
// browser), not in how components read it.
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a DashboardLocaleProvider or PublicLocaleProvider");
  return ctx;
}

export function dictionaryFor(locale: AppLocale): Dictionary {
  return DICTIONARIES[locale];
}
