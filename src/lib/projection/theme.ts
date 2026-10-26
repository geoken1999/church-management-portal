import type { ProjectionTheme } from "@/types/database";

// How the projector looks, as the church chose it. Anything that isn't a plain colour or a known font is dropped,
// because these values end up in a style attribute on a page anyone with the address can open. Pure.

export const DEFAULT_THEME: Required<ProjectionTheme> = { background: "#000000", color: "#ffffff", font: "sans" };

const HEX = /^#[0-9a-f]{6}$/i;

export function cleanTheme(input: unknown): ProjectionTheme {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const theme: ProjectionTheme = {};
  if (typeof raw.background === "string" && HEX.test(raw.background)) theme.background = raw.background.toLowerCase();
  if (typeof raw.color === "string" && HEX.test(raw.color)) theme.color = raw.color.toLowerCase();
  if (raw.font === "sans" || raw.font === "serif") theme.font = raw.font;
  return theme;
}

export const withDefaults = (theme: ProjectionTheme | null | undefined): Required<ProjectionTheme> => ({ ...DEFAULT_THEME, ...(theme ?? {}) });

/** The text size (in vw units of the screen's width) that fits a slide: short text is large, long text smaller. */
export function fontScale(textLength: number, mode: "full" | "lower_third"): number {
  const steps: [number, number][] = mode === "full" ? [[60, 6.4], [120, 5.2], [200, 4.4], [280, 3.7], [400, 3.1], [Infinity, 2.6]] : [[60, 3.2], [120, 2.8], [200, 2.4], [Infinity, 2.1]];
  return steps.find(([max]) => textLength <= max)![1];
}
