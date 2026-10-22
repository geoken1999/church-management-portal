import "server-only";

import type { AdminCaller } from "@/lib/admin-app/auth";
import type { AdminScope } from "@/lib/admin-app/scopes";
import type { SectionDoc, SectionResult } from "@/lib/admin-app/section-types";

export interface AdminSection {
  key: string;
  scope: AdminScope;
  title: string;
  description: string;
  /** A Material icon name the app knows (see sectionIcon in the app). */
  icon: string;
  load: (filter: string | null) => Promise<SectionDoc>;
  act?: (
    caller: AdminCaller,
    action: string,
    id: string | null,
    input: Record<string, string>,
  ) => Promise<SectionResult>;
}

export const inr = (n: number | null | undefined) =>
  `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;

export const when = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

export const day = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

export const ok = (message?: string): SectionResult => ({ ok: true, message });
export const fail = (error: string): SectionResult => ({ ok: false, error });
