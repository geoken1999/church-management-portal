"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LocaleContext, dictionaryFor } from "./LocaleContext";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "./config";

const STORAGE_KEY = "kf-locale";

// Wraps a single public page (Forms, Event registration, Give, Join, a
// shared Folder) for an anonymous visitor — no login to attach a
// preference to, so this persists to localStorage instead of a profile
// row. Per-browser, not per-organization: switching languages on one
// church's form remembers the choice for the next public page too.
export function PublicLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    function applyStoredLocale() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (isAppLocale(stored)) setLocaleState(stored);
      } catch {
        // Private browsing / blocked storage — just stays on the default.
      }
    }
    applyStoredLocale();
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort only — the choice still applies for this page view.
    }
  }, []);

  return <LocaleContext.Provider value={{ locale, t: dictionaryFor(locale), setLocale }}>{children}</LocaleContext.Provider>;
}
