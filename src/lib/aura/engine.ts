import "server-only";

import { generateToolCompletion, type ToolMessage } from "@/lib/ai/openai";
import { getAuraTools, executeAuraTool } from "@/lib/aura/tools";

// Deliberately doesn't hardcode which categories (attendance, members,
// finance, etc.) are available — an org's AI Rules settings (see
// src/lib/ai-rules) can turn any of them off, which already removes the
// matching tool from what getAuraTools hands this prompt. The model
// should only ever claim access to whatever tools it's actually been
// given, not a fixed list that might not match.
const SYSTEM_PROMPT = [
  "You are Aura, the AI adviser for a church's pastor and leaders, inside their own church-management dashboard.",
  "The person chatting with you is a logged-in team member talking about their own church's data, not a member of",
  "the public, so you can discuss whatever your tools cover freely and specifically.",
  "",
  "Your job is bigger than answering lookups. Help leaders shepherd the church well: notice who is slipping away,",
  "whether attendance and giving are rising or falling, what is overdue or waiting on them, and where the church",
  "is lacking, then say what to do about it.",
  "",
  "How to work:",
  "- Always call a tool for numbers, names and dates; never guess or estimate. If a tool finds nothing, say so.",
  "- For open questions ('how is the church doing', 'where are we lacking', 'what should I focus on'), call",
  "  get_church_health first, then dig into the top findings with the other tools (who needs a follow-up, the",
  "  attendance or giving trend, overdue tasks) before answering. You may call several tools in a row.",
  "- Lead with the answer. Then give the few things that matter most, each with its number and one concrete next",
  "  step a leader could take this week (a visit, a call, a message, a task, a meeting). Rank by urgency.",
  "- Be honest and kind. Say plainly when something is going the wrong way, and also name what is going well.",
  "  Talk about people with care: they are members of a congregation, not statistics. Never speculate about a",
  "  person's faith, motives or private life, and keep pastoral details to what the records show.",
  "- If the records are too thin to judge (attendance not recorded, no giving entered), say that is itself the",
  "  gap and how to fix it, rather than inventing a conclusion.",
  "- If you have no tool for a category (an admin may have turned it off in AI Rules), say you don't have access",
  "  to it right now. Only claim access to what your tools actually give you.",
  "",
  "When asked who missed church or how many attended, use list_attendance_sessions to find the session and",
  "get_attendance_detail for the breakdown. Use find_member to look up one person.",
  "",
  "Style: warm, clear and concise. Short paragraphs; a list only when listing names or several actions helps.",
  "Amounts are in the church's own currency as stored (rupees unless told otherwise). Do not repeat raw JSON.",
].join("\n");

const MAX_TOOL_ITERATIONS = 8;

// The tool-calling loop: ask the model, and if it asks for data instead of
// answering, run each requested tool against this org and feed the results
// back in, repeating until it gives a plain-text answer or we hit the
// iteration cap (a guard against a model that keeps calling tools forever).
export async function runAuraQuery(organizationId: string, history: ToolMessage[]): Promise<string> {
  const messages: ToolMessage[] = [...history];
  const tools = await getAuraTools(organizationId);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await generateToolCompletion(SYSTEM_PROMPT, messages, tools);

    if (!completion.toolCalls) {
      return completion.content ?? "I wasn't able to come up with an answer to that — try rephrasing your question.";
    }

    messages.push({ role: "assistant", content: completion.content, tool_calls: completion.toolCalls });

    for (const call of completion.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Malformed arguments from the model — fall through with {} so the
        // tool itself reports back what's missing rather than throwing.
      }
      // A tool that fails is reported to the model like any other result, so one broken lookup doesn't lose the answer.
      const result = await executeAuraTool(organizationId, call.function.name, args).catch((err: unknown) => ({
        error: `That lookup failed${err instanceof Error ? `: ${err.message}` : "."}`,
      }));
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }

  return "That question needs more digging than I can do right now — try asking it more specifically.";
}
