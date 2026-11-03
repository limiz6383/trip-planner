import type Anthropic from "@anthropic-ai/sdk";

/**
 * Web-search-enabled planning calls. Uses Anthropic's server-side web search
 * tool, so there is no client tool loop beyond resuming `pause_turn`.
 *
 * Opt out with LLM_WEB_SEARCH=0 (e.g. to cut cost/latency).
 */

export const WEB_SEARCH_MAX_USES = 8;
const MAX_PAUSE_RESUMES = 3;

export function webSearchEnabled(): boolean {
  return process.env.LLM_WEB_SEARCH !== "0";
}

export const WEB_SEARCH_ADDENDUM = `

WEB RESEARCH: you have a web_search tool. Use it sparingly (a handful of focused searches, not one per stop) to find what is genuinely worth doing in the destination: the must-do sights and experiences locals and well-travelled visitors actually recommend, real restaurants/cafes/bars that serve any dishes the traveller picked, and current opening days/hours for the places you schedule. Prefer recent local sources (local food and culture writers, city guides by residents, forum threads) over generic top-10 lists. AVOID tourist traps: overpriced restaurants next to major sights, "tourist menu" spots, gimmick attractions, and anything whose main reviews say it is overrated or a rip-off. Include a famous landmark only when it is truly worth the visit, and then suggest how to do it well (timing, ticket booking). A venue you found via search may be named even if it is not in community_posts, but only if sources agree it exists and is open; this relaxes the "never invent a venue" rule only for searched venues. Never put URLs or citations in the JSON. After researching, reply with ONLY the JSON object, no commentary.`;

export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Slice the JSON object out of text that may include preamble or fences. */
export function extractJsonObject(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith("{")) {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a !== -1 && b > a) s = s.slice(a, b + 1);
  }
  return s;
}

/**
 * Run a planning request with web search. No assistant prefill (the model
 * researches before answering); resumes pause_turn. Returns the final text.
 */
export async function runWithWebSearch(
  client: Anthropic,
  args: { model: string; system: string; userContent: string; maxTokens: number }
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: args.userContent },
  ];
  for (let i = 0; i <= MAX_PAUSE_RESUMES; i++) {
    const res = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system + WEB_SEARCH_ADDENDUM,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES },
      ],
      messages,
    });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    // Only the text after the last search matters; earlier text is preamble.
    return extractText(res.content);
  }
  throw new Error("Web search did not finish after repeated pauses.");
}
