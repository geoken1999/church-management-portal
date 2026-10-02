import "server-only";

function getOpenRouterEnv() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    throw new Error("Missing OPENROUTER_API_KEY or OPENROUTER_MODEL.");
  }
  return { apiKey, model };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Some OpenRouter models (including the one this app is configured with)
// are "reasoning" models that spend part of the token budget on an internal
// chain-of-thought before producing the actual reply — confirmed
// empirically: a low max_tokens here comes back with content: null and
// finish_reason: "length" because the reasoning pass alone used up the
// budget. 600 leaves enough room for reasoning plus a short DM reply.
const MAX_TOKENS = 600;

export async function generateReply(systemPrompt: string, history: ChatTurn[]): Promise<string | null> {
  const { apiKey, model } = getOpenRouterEnv();

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      max_tokens: MAX_TOKENS,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = data.choices?.[0]?.message?.content;
  return content ? content.trim() : null;
}
