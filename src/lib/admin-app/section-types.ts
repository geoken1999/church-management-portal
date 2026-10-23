// The shape every "more" screen of the KingdomFlow Admin app is sent in: a title, a few headline numbers and
// groups of rows, each row with optional buttons. The app draws any of them with one generic screen, so a new
// section needs only a loader here, never a new screen in the app.

export type SectionField = { label: string; value: string };
export type SectionTone = "good" | "warn" | "bad" | "info";

/** A question the app asks (in a form) before running an action. */
export type SectionInput = {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "select" | "multiselect" | "multiline";
  options?: { value: string; label: string }[];
  /** A multiselect answer comes back as the chosen values joined with commas. */
  required?: boolean;
  placeholder?: string;
  initial?: string;
};

export type SectionAction = {
  key: string;
  label: string;
  danger?: boolean;
  confirm?: string;
  inputs?: SectionInput[];
};

export type SectionItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: SectionTone;
  fields?: SectionField[];
  /** Long text shown when the row is opened (an error's stack, a ticket's description). */
  body?: string;
  actions?: SectionAction[];
};

export type SectionDoc = {
  title: string;
  note?: string;
  summary?: SectionField[];
  groups: { title?: string; items: SectionItem[] }[];
  /** Buttons for the whole screen, e.g. "Record expense". */
  actions?: SectionAction[];
  empty?: string;
  /** Narrow the list: the app sends the choice back as ?filter=. */
  filter?: { label: string; value: string; options: { value: string; label: string }[] };
};

export type SectionResult = { ok: true; message?: string } | { ok: false; error: string };
