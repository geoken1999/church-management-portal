import "server-only";

import { generateJsonCompletion } from "@/lib/ai/openai";
import type { MonthlyReportData, ReportLanguage, ReportTone } from "@/lib/reports/monthly";

const LANGUAGE_NAMES: Record<ReportLanguage, string> = { en: "English", ta: "Tamil (தமிழ்)", hi: "Hindi (हिन्दी)" };
const TONES: Record<ReportTone, string> = {
  warm: "warm and encouraging, like a pastor writing to the congregation, while staying factual",
  formal: "formal and precise, like a report to a church board, without flourishes",
  brief: "very short and plain: two short paragraphs at most, only the key points",
};

const cut = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * An AI-written summary of a report's figures, in the report's language. It is given
 * only the totals (no names, no letterhead), told to use no number that isn't in them,
 * and its answer is checked and trimmed before it is kept. Returns null if the AI
 * isn't set up or gives nothing usable; the report is then made without a summary.
 */
export async function writeReportNarrative(params: { data: MonthlyReportData; churchName: string; language: ReportLanguage; tone: ReportTone }): Promise<{ text: string; highlights: string[] } | null> {
  const { data, churchName, language, tone } = params;
  if (!process.env.OPENAI_API_KEY) return null;

  // Just the figures: nothing that identifies a person.
  const figures = {
    church: churchName,
    branch: data.branchName ?? "the whole church",
    period: data.label,
    kind: data.kind === "annual" ? "annual report (a whole year)" : "monthly report (one month)",
    members: data.members,
    attendance: data.attendance ? { servicesRecorded: data.attendance.services, totalAttendance: data.attendance.total, averagePerService: data.attendance.average, bestAttended: data.attendance.best?.count } : undefined,
    events: data.events ? { held: data.events.held, titles: data.events.list.map((e) => e.title) } : undefined,
    giving: data.giving,
    expensesAndBalance: data.expenses,
    byMonth: data.byMonth,
    volunteers: data.volunteers,
    prayerRequests: data.prayer,
  };

  const system = [
    `You write the summary at the top of a church's ${figures.kind}, for the church's leaders and members.`,
    `Write in ${LANGUAGE_NAMES[language]}. Tone: ${TONES[tone]}.`,
    "Use ONLY the figures in the JSON you are given. Never invent or estimate a number, name, event or fact, and never mention any individual person. Money is in Indian rupees: write amounts with the ₹ sign.",
    "If a section is missing from the JSON, say nothing about it. If a figure is zero, say little or nothing about it.",
    'Reply with a JSON object only: {"narrative": string, "highlights": string[]}. "narrative" is 2 to 4 short paragraphs separated by a blank line. "highlights" is 3 to 5 short bullet points, each a single sentence about one figure.',
  ].join(" ");

  let raw: string | null;
  try {
    raw = await generateJsonCompletion(system, JSON.stringify(figures), 1500);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { narrative?: unknown; highlights?: unknown };
    const text = cut(parsed.narrative, 3000);
    const highlights = Array.isArray(parsed.highlights) ? parsed.highlights.map((h) => cut(h, 220)).filter(Boolean).slice(0, 5) : [];
    return text ? { text, highlights } : null;
  } catch {
    return null;
  }
}
