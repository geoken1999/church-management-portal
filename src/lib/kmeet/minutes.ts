// K-Connect is sold as minutes per calendar month, not as a cap on one call. The plan gives a pool for video
// and a pool for audio (live classes and live-stream rooms are calls too, so they use the same pools). Minutes
// bought on top are one shared pool that is used once a plan pool runs out, and they too last only for the
// month they were bought in. Everything here is pure so it can be tested; the database reads are in
// minutes-service.ts.

import type { KmeetMode } from "@/types/database";

export interface CallRecord {
  mode: KmeetMode;
  startedAt: string | null;
  endedAt: string | null;
}

/** When a call that has not ended yet is counted up to. */
export function elapsedSeconds(
  call: CallRecord,
  from: Date,
  to: Date,
  now: Date,
): number {
  if (!call.startedAt) return 0;
  const start = Math.max(new Date(call.startedAt).getTime(), from.getTime());
  const end = Math.min(
    call.endedAt ? new Date(call.endedAt).getTime() : now.getTime(),
    to.getTime(),
    now.getTime(),
  );
  return Math.max(0, Math.round((end - start) / 1000));
}

export interface MinutesUsed {
  video: number;
  audio: number;
}

/** Whole minutes used this month per kind; a part-minute counts as a minute once per kind in total. */
export function minutesUsed(
  calls: CallRecord[],
  from: Date,
  to: Date,
  now: Date,
): MinutesUsed {
  const seconds = { video: 0, audio: 0 };
  for (const call of calls)
    seconds[call.mode] += elapsedSeconds(call, from, to, now);
  return {
    video: Math.ceil(seconds.video / 60),
    audio: Math.ceil(seconds.audio / 60),
  };
}

export interface MinutesPlan {
  /** null = unlimited */
  video: number | null;
  audio: number | null;
}

export interface MinutesSummary {
  video: { allowance: number | null; used: number; left: number | null };
  audio: { allowance: number | null; used: number; left: number | null };
  /** Bought this month. */
  extraBought: number;
  /** Bought minutes still unused: those spill over only when a plan pool is exhausted. */
  extraLeft: number;
}

export function summarizeMinutes(
  plan: MinutesPlan,
  used: MinutesUsed,
  extraBought: number,
): MinutesSummary {
  const over = (allowance: number | null, u: number) =>
    allowance === null ? 0 : Math.max(0, u - allowance);
  const extraUsed = over(plan.video, used.video) + over(plan.audio, used.audio);
  const extraLeft = Math.max(0, extraBought - extraUsed);
  const pool = (allowance: number | null, u: number) => ({
    allowance,
    used: u,
    left: allowance === null ? null : Math.max(0, allowance - u) + extraLeft,
  });
  return {
    video: pool(plan.video, used.video),
    audio: pool(plan.audio, used.audio),
    extraBought,
    extraLeft,
  };
}

/** Minutes a call of this kind can still run: null = unlimited, 0 = none left. */
export function minutesLeftFor(
  summary: MinutesSummary,
  mode: KmeetMode,
): number | null {
  return summary[mode].left;
}

export const NO_MINUTES_MESSAGE = (mode: KmeetMode) =>
  `You've used all of this month's K-Connect ${mode === "audio" ? "audio" : "video"} minutes. Buy more minutes from the K-Connect page, or wait for next month.`;

/** "2 h 05 min" / "45 min" for the minutes screens. */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}
