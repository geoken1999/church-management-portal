import "server-only";

import { generateToolCompletion, type ToolMessage } from "@/lib/ai/openai";
import { AURA_TOOLS, executeAuraTool } from "@/lib/aura/tools";

const SYSTEM_PROMPT = [
  "You are Aura, an internal AI assistant for church staff inside their own church-management dashboard.",
  "The person chatting with you is a logged-in team member asking about their own organization's data —",
  "not a member of the public — so you can discuss attendance, members, events, donations, and fundraisers",
  "freely and specifically.",
  "",
  "You have tools to query the organization's real data. Always call a tool to get numbers or names rather",
  "than guessing or estimating — if a question needs data you have a tool for, call it before answering.",
  "If a tool call turns up nothing relevant, say so plainly instead of making something up.",
  "",
  "When asked things like \"who missed church\" or \"how many attended,\" use list_attendance_sessions to find",
  "the right session (matching by date or event name) and then get_attendance_detail for the breakdown.",
  "",
  "Keep answers concise and conversational — a short summary with the key numbers, not a wall of text. Use a",
  "list only when listing names or multiple items actually helps.",
].join("\n");

const MAX_TOOL_ITERATIONS = 5;

// The tool-calling loop: ask the model, and if it asks for data instead of
// answering, run each requested tool against this org and feed the results
// back in, repeating until it gives a plain-text answer or we hit the
// iteration cap (a guard against a model that keeps calling tools forever).
export async function runAuraQuery(organizationId: string, history: ToolMessage[]): Promise<string> {
  const messages: ToolMessage[] = [...history];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await generateToolCompletion(SYSTEM_PROMPT, messages, AURA_TOOLS);

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
      const result = await executeAuraTool(organizationId, call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }

  return "That question needs more digging than I can do right now — try asking it more specifically.";
}
