/**
 * POST /api/trips/[id]/consult
 *
 * One turn of the AI consulting conversation. Auth-gated.
 *
 * Request body:
 *   {
 *     userMessage:  string;
 *     history:      { role: "user" | "assistant"; content: string }[];
 *     partialBrief: Partial<LLMTripBrief>;   // may be {} on first turn
 *   }
 *
 * Response (200):
 *   {
 *     assistantMessage: string;
 *     partialBrief:     Partial<LLMTripBrief>;
 *     briefComplete:    boolean;
 *   }
 *
 * Error responses:
 *   401  { error: "Unauthorized" }
 *   400  { error: string }          — bad request body
 *   500  { error: string }          — Anthropic key missing or LLM error
 */

import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { defaultProvider } from "@/lib/llm/provider";
import type { ConversationMessage } from "@/lib/llm/provider";
import type { LLMTripBrief } from "@/lib/types";

// ---- request / response shapes (exported so the client component can import) ----

export interface ConsultRequestBody {
  userMessage: string;
  history: ConversationMessage[];
  partialBrief: Partial<LLMTripBrief>;
}

export interface ConsultResponseBody {
  assistantMessage: string;
  partialBrief: Partial<LLMTripBrief>;
  briefComplete: boolean;
}

// ---- handler ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth gate — returns null when not signed in (no redirect in Route Handlers)
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tripId } = await params;

  if (!tripId) {
    return Response.json({ error: "Missing trip id" }, { status: 400 });
  }

  // Parse and validate request body
  let body: ConsultRequestBody;
  try {
    body = (await request.json()) as ConsultRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userMessage, history, partialBrief } = body;

  if (typeof userMessage !== "string" || userMessage.trim() === "") {
    return Response.json(
      { error: "userMessage must be a non-empty string" },
      { status: 400 }
    );
  }

  if (!Array.isArray(history)) {
    return Response.json(
      { error: "history must be an array" },
      { status: 400 }
    );
  }

  // Guard: ANTHROPIC_API_KEY must be present — fail with a clear 500 instead
  // of crashing the module at import time (the provider reads the key lazily).
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. " +
          "Add it to .env.local.",
      },
      { status: 500 }
    );
  }

  try {
    const result = await defaultProvider.consultingTurn({
      history,
      userMessage,
      partialBrief: partialBrief ?? {},
    });

    const responseBody: ConsultResponseBody = {
      assistantMessage: result.assistantMessage,
      partialBrief: result.updatedBrief,
      briefComplete: result.briefComplete,
    };

    return Response.json(responseBody, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "LLM call failed unexpectedly.";
    return Response.json({ error: message }, { status: 500 });
  }
}
