import "server-only";

import { generateJsonCompletion } from "@/lib/ai/openai";
import { LOCALE_LABELS, type AppLocale } from "@/lib/i18n/config";
import { MAX_TRANSLATED_LENGTH, MAX_TRANSLATION_STRINGS, type BilingualConfig } from "@/lib/bilingual/config";

const BATCH_SIZE = 40;

async function translateBatch(texts: string[], source: AppLocale, target: AppLocale): Promise<string[]> {
  const system = [
    `You translate short pieces of text on a church's web form from ${LOCALE_LABELS[source]} into ${LOCALE_LABELS[target]}.`,
    'Reply with a JSON object of the form {"translations": ["...", "..."]}: exactly one translation per input, in the same order.',
    "Keep it short and natural, as a form label or option would read. Keep proper nouns, numbers and punctuation as they are.",
    "If a text is already in the target language, or has nothing to translate, return it unchanged.",
  ].join(" ");

  const raw = await generateJsonCompletion(system, JSON.stringify({ texts }));
  if (!raw) throw new Error("The translation service returned nothing.");

  let parsed: { translations?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The translation service returned an unreadable reply.");
  }
  const list = parsed.translations;
  if (!Array.isArray(list) || list.length !== texts.length || list.some((item) => typeof item !== "string")) {
    throw new Error("The translation service returned an unexpected reply.");
  }
  return (list as string[]).map((item) => item.trim().slice(0, MAX_TRANSLATED_LENGTH));
}

export interface TranslationOutcome {
  config: BilingualConfig;
  // Set when translating failed: the config still has whatever was already
  // translated, so the form keeps working, just with those texts in one
  // language until the next save succeeds.
  warning?: string;
}

// Makes `translations` cover exactly `strings`: keeps translations for text
// that hasn't changed (and for the same language pair), translates only
// what is new, and drops translations for text that no longer exists.
export async function ensureTranslations(wanted: { source: AppLocale; target: AppLocale }, strings: string[], existing: BilingualConfig | null): Promise<TranslationOutcome> {
  const samePair = existing?.source === wanted.source && existing?.target === wanted.target;
  const kept: Record<string, string> = {};
  for (const text of strings.slice(0, MAX_TRANSLATION_STRINGS)) {
    const known = samePair ? existing?.translations[text] : undefined;
    if (known) kept[text] = known;
  }

  const missing = strings.slice(0, MAX_TRANSLATION_STRINGS).filter((text) => !kept[text]);
  const config: BilingualConfig = { source: wanted.source, target: wanted.target, translations: kept };
  if (missing.length === 0) return { config };

  try {
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const translated = await translateBatch(batch, wanted.source, wanted.target);
      batch.forEach((text, index) => {
        if (translated[index]) config.translations[text] = translated[index];
      });
    }
    return { config };
  } catch (err) {
    console.error("Form translation failed:", err);
    return { config, warning: "Saved, but the automatic translation didn't complete, so some text is shown in one language. Save again to retry." };
  }
}
