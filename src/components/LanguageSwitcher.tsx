"use client";

import { Globe, Check } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Works in both the dashboard (wrapped in DashboardLocaleProvider,
// persists to the signed-in user's profile) and any public page (wrapped
// in PublicLocaleProvider, persists to the visitor's browser) — it only
// ever talks to useLocale(), never to either provider directly, so the
// same component works everywhere the language can be changed.
export function LanguageSwitcher() {
  const { locale, t, setLocale } = useLocale();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="icon" aria-label={t.languageSwitcher.label}>
            <Globe className="size-4.5" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56">
        <p className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">{t.languageSwitcher.label}</p>
        <div className="flex flex-col gap-0.5">
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              {LOCALE_LABELS[code]}
              {code === locale && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
        </div>
        <p className="mt-1 border-t border-border px-1.5 pt-2 text-xs text-muted-foreground">{t.languageSwitcher.comingSoon}</p>
      </PopoverContent>
    </Popover>
  );
}
