"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n/config";

export interface BilingualChoice {
  enabled: boolean;
  source: AppLocale;
  target: AppLocale;
}

export function bilingualChoiceFrom(config: { source: AppLocale; target: AppLocale } | null | undefined): BilingualChoice {
  return config ? { enabled: true, source: config.source, target: config.target } : { enabled: false, source: "en", target: "hi" };
}

// What a form submits for its bilingual setting: the two languages, or an
// empty string for single-language.
export function bilingualChoiceToField(choice: BilingualChoice): string {
  return choice.enabled ? JSON.stringify({ source: choice.source, target: choice.target }) : "";
}

// "Do you want this in two languages?" The admin writes the form in the
// first language; the second is added automatically when they save
// ("Name / नाम").
export function BilingualSettings({
  value,
  onChange,
  disabled,
  noun = "form",
}: {
  value: BilingualChoice;
  onChange: (next: BilingualChoice) => void;
  disabled?: boolean;
  noun?: string;
}) {
  function setSource(source: AppLocale) {
    // The two languages must differ: moving one onto the other swaps it out.
    onChange({ ...value, source, target: value.target === source ? SUPPORTED_LOCALES.find((l) => l !== source)! : value.target });
  }
  function setTarget(target: AppLocale) {
    onChange({ ...value, target, source: value.source === target ? SUPPORTED_LOCALES.find((l) => l !== target)! : value.source });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <label className="flex items-start gap-2">
        <Checkbox checked={value.enabled} onCheckedChange={(c) => onChange({ ...value, enabled: c === true })} disabled={disabled} />
        <span className="text-sm">
          <span className="font-medium">Show this {noun} in two languages</span>
          <br />
          <span className="text-muted-foreground">Everything is shown in both, like &ldquo;Name / नाम&rdquo;. The second language is translated automatically when you save.</span>
        </span>
      </label>

      {value.enabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">I write the {noun} in</Label>
            <Select value={value.source} onValueChange={(v) => setSource((v ?? "en") as AppLocale)} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => LOCALE_LABELS[value.source]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LOCALE_LABELS[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Also show it in</Label>
            <Select value={value.target} onValueChange={(v) => setTarget((v ?? "hi") as AppLocale)} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => LOCALE_LABELS[value.target]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LOCALE_LABELS[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
