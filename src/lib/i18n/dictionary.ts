import { en, type Dictionary } from "./dictionaries/en";
import { ta } from "./dictionaries/ta";
import { hi } from "./dictionaries/hi";
import type { AppLocale } from "./config";

export type { Dictionary };

export const DICTIONARIES: Record<AppLocale, Dictionary> = { en, ta, hi };
