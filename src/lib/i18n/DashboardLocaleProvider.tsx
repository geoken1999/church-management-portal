"use client";

import { useCallback, useState, useTransition, type ReactNode } from "react";
import { updateProfileLocale } from "@/lib/profile/actions";
import { LocaleContext, dictionaryFor } from "./LocaleContext";
import type { AppLocale } from "./config";

// Wraps the whole dashboard (see DashboardShell) so any component in the
// tree can read/switch the signed-in user's language via useLocale() — the
// choice is persisted to profiles.locale (one row per auth user, not per
// organization), so it follows that person across every church they
// belong to, not just the one they're currently viewing.
export function DashboardLocaleProvider({ initialLocale, children }: { initialLocale: AppLocale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [, startTransition] = useTransition();

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    startTransition(() => {
      updateProfileLocale(next);
    });
  }, []);

  return <LocaleContext.Provider value={{ locale, t: dictionaryFor(locale), setLocale }}>{children}</LocaleContext.Provider>;
}
