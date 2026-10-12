import type { KmeetMode } from "@/types/database";
import type { TabKey } from "@/lib/permissions/tabs";

export function tabKeyForMode(mode: KmeetMode): TabKey {
  return mode === "audio" ? "kaudio" : "kmeet";
}

export function dashboardBasePathForMode(mode: KmeetMode): string {
  return mode === "audio" ? "/dashboard/kaudio" : "/dashboard/kmeet";
}

// The one list page for both kinds of call.
export const KCONNECT_PATH = "/dashboard/kconnect";

export function publicBasePathForMode(mode: KmeetMode): string {
  return mode === "audio" ? "/kaudio" : "/kmeet";
}

export function labelForMode(mode: KmeetMode): string {
  return mode === "audio" ? "K-Connect audio" : "K-Connect video";
}
