// Pure rules for filling a WhatsApp template's {{n}} placeholders. Each
// placeholder is either one typed value sent to everyone, or a field taken
// from each recipient's member record. No server imports, so the composer and
// the send action use the same rules.

export type MemberField = "first_name" | "full_name" | "branch";

export type PlaceholderSpec =
  | { kind: "fixed"; value: string }
  | { kind: "member"; field: MemberField; fallback: string };

export const MEMBER_FIELDS: { key: MemberField; label: string }[] = [
  { key: "first_name", label: "Member's first name" },
  { key: "full_name", label: "Member's full name" },
  { key: "branch", label: "Member's branch" },
];

export interface MemberContext {
  firstName: string;
  fullName: string;
  branchName: string | null;
}

export function isMemberField(value: unknown): value is MemberField {
  return MEMBER_FIELDS.some((f) => f.key === value);
}

// Reads the specs the composer sent. Returns null if they're not a usable list
// for `count` placeholders, so a tampered request can't slip a bad value through.
export function parsePlaceholderSpecs(raw: unknown, count: number): PlaceholderSpec[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const specs: PlaceholderSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const entry = item as Record<string, unknown>;
    if (entry.kind === "fixed" && typeof entry.value === "string") {
      specs.push({ kind: "fixed", value: entry.value });
    } else if (entry.kind === "member" && isMemberField(entry.field) && typeof entry.fallback === "string") {
      specs.push({ kind: "member", field: entry.field, fallback: entry.fallback });
    } else {
      return null;
    }
  }
  return specs;
}

export function validatePlaceholderSpec(spec: PlaceholderSpec): string | undefined {
  if (spec.kind === "fixed") {
    return spec.value.trim() ? undefined : "Enter the value to send.";
  }
  return spec.fallback.trim() ? undefined : "Enter a fallback for numbers that aren't members.";
}

// The text sent for one recipient. A member with no value in that field (no
// branch, say) gets the fallback rather than an empty placeholder, which Meta
// rejects.
export function resolvePlaceholder(spec: PlaceholderSpec, member: MemberContext | null): string {
  if (spec.kind === "fixed") return spec.value;
  if (!member) return spec.fallback;
  const value =
    spec.field === "first_name" ? member.firstName : spec.field === "full_name" ? member.fullName : member.branchName ?? "";
  return value.trim() || spec.fallback;
}

// What a campaign's history shows for each placeholder: the typed value, or a
// marker for the member field, rather than one recipient's name.
export function placeholderLabel(spec: PlaceholderSpec): string {
  if (spec.kind === "fixed") return spec.value;
  return `{${spec.field}}`;
}
