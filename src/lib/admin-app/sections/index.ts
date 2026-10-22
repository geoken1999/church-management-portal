import "server-only";

import type { AdminScope } from "@/lib/admin-app/scopes";
import type { AdminSection } from "./common";
import { financeSections } from "./finance";
import { operationsSections } from "./operations";
import { platformSections } from "./platform";
import { supportSections } from "./support";

export const ALL_SECTIONS: AdminSection[] = [
  ...financeSections,
  ...operationsSections,
  ...platformSections,
  ...supportSections,
];

export function sectionByKey(key: string): AdminSection | undefined {
  return ALL_SECTIONS.find((s) => s.key === key);
}

/** The sections a person with these scopes may open, as the app's menu lists them. */
export function sectionMenu(scopes: readonly AdminScope[]) {
  return ALL_SECTIONS.filter((s) => scopes.includes(s.scope)).map((s) => ({
    key: s.key,
    scope: s.scope,
    title: s.title,
    description: s.description,
    icon: s.icon,
  }));
}
