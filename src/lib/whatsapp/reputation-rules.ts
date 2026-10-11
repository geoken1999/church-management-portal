// Whether a church's recent WhatsApp record is bad enough to pause its
// marketing sends. Pure, so the sender, the admin page and the tests share it.
//
// On the shared KingdomFlow number every church's messages count toward one
// quality rating, so a church whose marketing keeps being refused by
// WhatsApp (131049) hurts all the others. Only messages with a known outcome
// count (still-in-flight ones haven't been judged), and a small sample is
// never enough to act on.
export const REPUTATION_WINDOW_DAYS = 7;
export const REPUTATION_MIN_RESOLVED = 20;
export const REPUTATION_MAX_LIMIT_RATE = 0.25;

export interface SenderStats {
  resolved: number; // delivered + read + failed (any reason)
  limited: number; // failed with 131049
}

export function limitRate(stats: SenderStats): number {
  return stats.resolved === 0 ? 0 : stats.limited / stats.resolved;
}

export function shouldPauseMarketing(stats: SenderStats): boolean {
  return stats.resolved >= REPUTATION_MIN_RESOLVED && limitRate(stats) >= REPUTATION_MAX_LIMIT_RATE;
}

// Folds log rows into stats: only marketing, and only once a result is known.
export function statsFromLog(rows: { status: string; error_code: string | null; category: string | null }[]): SenderStats {
  let resolved = 0;
  let limited = 0;
  for (const row of rows) {
    if ((row.category ?? "").toLowerCase() !== "marketing") continue;
    if (row.status === "sent") continue;
    resolved += 1;
    if (row.status === "failed" && row.error_code === "131049") limited += 1;
  }
  return { resolved, limited };
}
