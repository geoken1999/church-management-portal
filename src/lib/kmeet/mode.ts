import type { KmeetMode } from "@/types/database";
import type { TabKey } from "@/lib/permissions/tabs";

export function tabKeyForMode(mode: KmeetMode): TabKey {
  return mode === "audio" ? "kaudio" : "kmeet";
}

export function dashboardBasePathForMode(mode: KmeetMode): string {
  return mode === "audio" ? "/dashboard/kaudio" : "/dashboard/kmeet";
}

export function publicBasePathForMode(mode: KmeetMode): string {
  return mode === "audio" ? "/kaudio" : "/kmeet";
}

export function labelForMode(mode: KmeetMode): string {
  return mode === "audio" ? "K-Audio" : "K-meet";
}
