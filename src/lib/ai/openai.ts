import "server-only";

function getOpenAiEnv() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return { apiKey, model };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function generateReply(systemPrompt: string, history: ChatTurn[]): Promise<string | null> {
  const { apiKey, model } = getOpenAiEnv();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = data.choices?.[0]?.message?.content;
  return content ? content.trim() : null;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ToolMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCompletion {
  content: string | null;
  toolCalls: ToolCall[] | null;
}

// Separate from generateReply above (which is a plain two-role chat turn,
// used by the Instagram DM auto-reply) — this carries the richer messages
// shape tool-calling needs (assistant tool_calls + tool-role results) for
// Ask Aura's query loop (see src/lib/aura/engine.ts).
export async function generateToolCompletion(
  systemPrompt: string,
  messages: ToolMessage[],
  tools: ToolDefinition[],
): Promise<ToolCompletion> {
  const { apiKey, model } = getOpenAiEnv();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
  };
  const message = data.choices?.[0]?.message;
  return {
    content: message?.content ? message.content.trim() : null,
    toolCalls: message?.tool_calls && message.tool_calls.length > 0 ? message.tool_calls : null,
  };
}
