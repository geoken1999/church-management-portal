import { zonedTimeToUtc } from "@/lib/organizations/timezone";

// Soonest and latest a campaign can be scheduled for, counted from now.
export const MIN_LEAD_MINUTES = 5;
export const MAX_LEAD_DAYS = 366;

// The time the person picked is the church's local time (the form has no timezone).
// Returns the moment to send, or the reason it can't be used.
export function parseScheduleTime(local: string, timeZone: string, now: Date = new Date()): { at: Date } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return { error: "Choose a valid date and time." };
  const at = zonedTimeToUtc(local, timeZone);
  if (Number.isNaN(at.getTime())) return { error: "Choose a valid date and time." };
  if (at.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) return { error: `Choose a time at least ${MIN_LEAD_MINUTES} minutes from now.` };
  if (at.getTime() > now.getTime() + MAX_LEAD_DAYS * 86_400_000) return { error: "Choose a time within the next year." };
  return { at };
}

// How far through its wait a stuck "sending" campaign must be before it is treated as dead.
export const STUCK_SENDING_MINUTES = 20;

export function summarize(channel: "email" | "sms" | "whatsapp", text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const max = channel === "email" ? 120 : 100;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
