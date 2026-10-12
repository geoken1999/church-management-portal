// The kinds of gift a church can accept online, outside any fundraiser. Pure,
// so the rules are testable.

export const GIVING_TYPES = ["offering", "tithe", "donation"] as const;
export type GivingType = (typeof GIVING_TYPES)[number];

export const GIVING_TYPE_LABELS: Record<GivingType, string> = {
  offering: "Offering",
  tithe: "Tithe",
  donation: "Donation",
};

export function isGivingType(value: unknown): value is GivingType {
  return typeof value === "string" && (GIVING_TYPES as readonly string[]).includes(value);
}

// Keeps only known types, once each, in a fixed order.
export function normalizeGivingTypes(values: unknown): GivingType[] {
  if (!Array.isArray(values)) return [];
  return GIVING_TYPES.filter((type) => values.includes(type));
}

// A paid offering or tithe is recorded as an offering (with this category); a
// donation as a donation.
export function recordKindFor(type: GivingType | "fundraiser"): { table: "offerings"; category: string } | { table: "donations" } {
  if (type === "offering" || type === "tithe") return { table: "offerings", category: GIVING_TYPE_LABELS[type] };
  return { table: "donations" };
}
