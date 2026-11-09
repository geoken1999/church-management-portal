import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { QrCodeRow, QrScanRow } from "@/types/database";

export const getQrCodes = cache(async (organizationId: string): Promise<QrCodeRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("qr_codes").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
  return data ?? [];
});

export interface QrStats {
  byPlatform: Record<QrScanRow["platform"], number>;
  /** Scans per day for the last 14 days, oldest first. */
  perDay: { day: string; count: number }[];
  topCountries: { country: string; count: number }[];
}

/** Scan breakdown for one code, from its last 5,000 scans. */
export async function getQrStats(organizationId: string, qrCodeId: string): Promise<QrStats> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("qr_scans")
    .select("platform, country, scanned_at")
    .eq("organization_id", organizationId)
    .eq("qr_code_id", qrCodeId)
    .order("scanned_at", { ascending: false })
    .limit(5000);

  const byPlatform = { ios: 0, android: 0, desktop: 0 };
  const countries = new Map<string, number>();
  const days = new Map<string, number>();
  for (let i = 13; i >= 0; i--) days.set(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), 0);
  for (const scan of data ?? []) {
    byPlatform[scan.platform]++;
    if (scan.country) countries.set(scan.country, (countries.get(scan.country) ?? 0) + 1);
    const day = scan.scanned_at.slice(0, 10);
    if (days.has(day)) days.set(day, (days.get(day) ?? 0) + 1);
  }
  return {
    byPlatform,
    perDay: [...days].map(([day, count]) => ({ day, count })),
    topCountries: [...countries].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([country, count]) => ({ country, count })),
  };
}
