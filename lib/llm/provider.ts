/**
 * LLM Provider abstraction.
 *
 * All LLM calls are SERVER-SIDE ONLY. This module must never be imported
 * by Client Components (it reads ANTHROPIC_API_KEY at call time).
 *
 * The LLMProvider interface makes the underlying model swappable: drop in
 * a different implementation (OpenAI, Gemini, local Ollama) without touching
 * the planner engine.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMItinerary, LLMTripBrief, TripBrief, Booking, CommunityPost } from "@/lib/types";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * A single turn in a consulting conversation.
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Parameters for one consulting conversation turn (gathering trip intent).
 */
export interface ConsultingTurnParams {
  /** Full conversation history so far */
  history: ConversationMessage[];
  /** The latest user message to respond to */
  userMessage: string;
  /** Partial trip brief assembled so far (may be empty on first turn) */
  partialBrief: Partial<LLMTripBrief>;
  /**
   * Trip facts already known from the trip row (entered on the create-trip
   * form). The consultant must NEVER re-ask for these.
   */
  knownTrip: {
    destination: string;
    start_date: string;
    end_date: string;
  };
  /**
   * Flights and accommodation details collected before the consulting session.
   * When present the consultant treats them as fixed facts, never asks for them,
   * and factors them into its questions and suggestions (e.g. a late arrival
   * means day 1 is light; lodging neighbourhood anchors recommendations).
   * When null/undefined the consultant behaves as if no logistics are known.
   */
  booking?: Booking | null;
}

/**
 * Response from a consulting turn.
 */
export interface ConsultingTurnResult {
  /** The assistant's response text */
  assistantMessage: string;
  /**
   * Updated partial brief if the model extracted new structured fields.
   * If the brief is complete (all required fields present) the planner
   * engine can proceed to itinerary generation.
   */
  updatedBrief: Partial<LLMTripBrief>;
  /** True when the model signals the brief is fully collected */
  briefComplete: boolean;
}

/**
 * Parameters for itinerary generation.
 */
export interface GenerateItineraryParams {
  brief: TripBrief;
  /** Community posts ranked and filtered by the retrieval pipeline */
  rankedPosts: CommunityPost[];
  /**
   * Dates that are locked and must not be replanned.
   * ISO date strings (YYYY-MM-DD).
   */
  lockedDates?: string[];
  /**
   * Optional booking record for the trip.
   * When present the model uses flight times to bound day-1 and last-day
   * usable hours, and clusters activities near the accommodation location.
   * When null/undefined the model plans full days as if no constraints exist.
   */
  booking?: Booking | null;
}

/**
 * Provider interface — implement this to swap out the underlying model.
 */
export interface LLMProvider {
  /**
   * Handles one turn of the consulting conversation.
   * Gathers trip intent and extracts structured TripBrief fields.
   */
  consultingTurn(params: ConsultingTurnParams): Promise<ConsultingTurnResult>;

  /**
   * Generates a full itinerary from a completed TripBrief + ranked posts.
   */
  generateItinerary(params: GenerateItineraryParams): Promise<LLMItinerary>;
}

// ---------------------------------------------------------------------------
// Anthropic implementation
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-4-5";
// Itinerary generation emits a large JSON payload; Opus can take ~30s for that.
// Sonnet is markedly faster and more than capable for structured itineraries.
const ITINERARY_MODEL = "claude-sonnet-4-5";

/** System prompt for the consulting conversation phase */
const CONSULTING_SYSTEM_PROMPT = `You are a knowledgeable travel planning assistant helping a user plan a trip.

IMPORTANT — destination and travel dates are ALREADY KNOWN. You must NEVER ask about them. They will be provided to you at the start of every turn in a context block. Your opening message must naturally reference the destination and the number of days (e.g. "Let's plan your 4-day trip to Tokyo!").

LOGISTICS — If a "Booked logistics" block appears in the context, the user has already provided flight and accommodation details. You must:
- NEVER ask for flight arrival/departure times, accommodation name, neighbourhood, check-in, or check-out — these are already set.
- Treat them as fixed facts and factor them into your questions and suggestions. For example:
  - A late-evening arrival means day 1 will be short — acknowledge this and suggest a light first day.
  - An early departure means the last day ends early — note this when discussing pace.
  - The accommodation neighbourhood is a natural anchor for activity recommendations.
- If no "Booked logistics" block appears, behave as today — do not mention flights or accommodation unless the user raises them.

Your goal is to gather ONLY the following remaining fields through natural conversation (do not gather destination, start_date, end_date, or any logistics already provided):
- Daily budget in USD
- Travel vibe / keywords (e.g. "relaxing", "foodie", "adventure")
- Party composition (number of adults, children, infants)
- Local vs touristy preference (on a scale from 0.0 very local to 1.0 very touristy)
- Dietary constraints (if any)
- Accessibility needs (if any)
- Travel pace (relaxed, moderate, or fast)

Tailor your questions and suggestions to the trip length you are given. For example, a 3-day trip needs a tighter itinerary than a 14-day trip.

Ask one or two questions at a time — keep it conversational.
When you have enough information to fill all fields, respond with a final summary and include a JSON block like:

\`\`\`json
{
  "brief_complete": true,
  "brief": {
    "destination": "...",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "daily_budget_usd": 100,
    "vibe_keywords": ["..."],
    "party_composition": { "adults": 2 },
    "local_touristy_dial": 0.4,
    "dietary_constraints": [],
    "accessibility_needs": [],
    "pace": "moderate"
  }
}
\`\`\`

Always populate destination, start_date, and end_date in the brief JSON from the known trip facts — never leave them blank or ask the user to re-enter them.

If you don't have enough information yet, omit the JSON block and keep asking.`;

/** System prompt for the itinerary generation phase */
const ITINERARY_SYSTEM_PROMPT = `You are an expert travel itinerary planner.
You will receive a trip brief, a set of community-sourced place recommendations, and optionally a booking record containing flight and accommodation details.

Generate a detailed day-by-day itinerary that:
1. Respects the budget, pace, and preferences in the brief
2. Prioritises places from the community posts, especially those matching the local/touristy dial
3. Produces a realistic schedule with appropriate timing and logical geography
4. Estimates costs for each activity
5. Includes 3-4 activities per day MAXIMUM — favor realistic pacing and quality over packing the day
6. Keeps each activity "description" to ONE short sentence (the goal is a fast, scannable plan, not an essay)

BOOKING CONSTRAINTS — apply these rules when a booking object is provided:

Flight arrival (flight_arrival_date + flight_arrival_time):
- Day 1 of the trip starts at the arrival time, not at the beginning of the day.
- Subtract realistic airport-to-accommodation transit time (typically 1–2 hours depending on destination).
- Schedule only activities that fit in the remaining usable hours. For late arrivals (e.g. 21:00+) day 1 should contain only arrival logistics and dinner/rest — no sightseeing.

Flight departure (flight_departure_date + flight_departure_time):
- The last day ends when the traveller must leave for the airport.
- Allow at least 2–3 hours before departure for transit and check-in (adjust for destination norms).
- For early departures (e.g. before 10:00) the last day may have zero or only one quick activity.

Accommodation location (accommodation_neighborhood, accommodation_lat, accommodation_lon):
- Cluster activities geographically near the accommodation where possible to minimise transit time.
- When the accommodation neighbourhood is known, explicitly note proximity in activity descriptions.
- Account for accommodation check-in time on day 1 (typically 15:00 or as known).

If no booking is provided, or booking fields are null, plan full days from morning to evening as normal — do not invent flight or accommodation constraints.

Respond ONLY with valid JSON matching this exact shape:
{
  "destination": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "total_cost_estimate": 0,
  "notes": "string",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "daily_cost": 0,
      "activities": [
        {
          "name": "string",
          "description": "string",
          "estimated_time_hours": 1.5,
          "estimated_cost_usd": 20,
          "place_name": "string",
          "source_attribution": "string or empty",
          "activity_type": "food|culture|outdoor|shopping|transport|accommodation|entertainment|other"
        }
      ]
    }
  ]
}`;

export class AnthropicProvider implements LLMProvider {
  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local."
      );
    }
    return new Anthropic({ apiKey });
  }

  async consultingTurn(
    params: ConsultingTurnParams
  ): Promise<ConsultingTurnResult> {
    const client = this.getClient();

    // Compute trip length in days so the model can tailor its questions.
    const msPerDay = 1000 * 60 * 60 * 24;
    const startMs = new Date(params.knownTrip.start_date).getTime();
    const endMs = new Date(params.knownTrip.end_date).getTime();
    const tripDays = Math.round((endMs - startMs) / msPerDay) + 1;

    // Build a per-turn context block injected as the first user message so the
    // model always has the known trip facts, the current partial brief, and any
    // pre-collected booking details.
    const bookingLines: string[] = [];
    if (params.booking) {
      const b = params.booking;
      bookingLines.push("", "Booked logistics (fixed — do not ask about these):");
      if (b.flight_arrival_date) {
        bookingLines.push(
          `  Flight arrival: ${b.flight_arrival_date}${b.flight_arrival_time ? " at " + b.flight_arrival_time : ""}`
        );
      }
      if (b.flight_departure_date) {
        bookingLines.push(
          `  Flight departure: ${b.flight_departure_date}${b.flight_departure_time ? " at " + b.flight_departure_time : ""}`
        );
      }
      if (b.accommodation_name) {
        bookingLines.push(`  Accommodation: ${b.accommodation_name}`);
      }
      if (b.accommodation_neighborhood) {
        bookingLines.push(`  Neighbourhood: ${b.accommodation_neighborhood}`);
      }
      if (b.accommodation_check_in) {
        bookingLines.push(`  Check-in: ${b.accommodation_check_in}`);
      }
      if (b.accommodation_check_out) {
        bookingLines.push(`  Check-out: ${b.accommodation_check_out}`);
      }
    }

    const knownFactsBlock = [
      "--- TRIP CONTEXT (already known — do not ask about these) ---",
      `Destination: ${params.knownTrip.destination}`,
      `Start date: ${params.knownTrip.start_date}`,
      `End date: ${params.knownTrip.end_date}`,
      `Trip length: ${tripDays} day${tripDays !== 1 ? "s" : ""}`,
      ...bookingLines,
      "",
      "Current partial brief (fields gathered so far):",
      JSON.stringify(
        {
          ...params.knownTrip,
          ...params.partialBrief,
        },
        null,
        2
      ),
      "--- END TRIP CONTEXT ---",
    ].join("\n");

    // Prepend the context block to the conversation. If there is no history yet
    // this becomes the sole user turn; otherwise it is injected before the
    // existing history so the model always sees it at position 0.
    const historyMessages: Anthropic.MessageParam[] = params.history.map(
      (m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: knownFactsBlock },
      { role: "assistant", content: "Understood. I have the trip context." },
      ...historyMessages,
      { role: "user", content: params.userMessage },
    ];

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: CONSULTING_SYSTEM_PROMPT,
      messages,
    });

    const assistantMessage =
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";

    // Always seed the brief with the known trip facts so they are never lost.
    const knownFields: Pick<LLMTripBrief, "destination" | "start_date" | "end_date"> = {
      destination: params.knownTrip.destination,
      start_date: params.knownTrip.start_date,
      end_date: params.knownTrip.end_date,
    };

    // Try to extract the structured brief from a ```json block
    let updatedBrief: Partial<LLMTripBrief> = { ...knownFields, ...params.partialBrief };
    let briefComplete = false;

    const jsonMatch = assistantMessage.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as {
          brief_complete?: boolean;
          brief?: Partial<LLMTripBrief>;
        };
        if (parsed.brief) {
          // Merge: known facts take precedence over whatever the LLM emits for
          // destination/dates to prevent the model from accidentally changing them.
          updatedBrief = { ...params.partialBrief, ...parsed.brief, ...knownFields };
        }
        briefComplete = parsed.brief_complete === true;
      } catch {
        // Malformed JSON in the response — keep the partial brief as-is
      }
    }

    return { assistantMessage, updatedBrief, briefComplete };
  }

  async generateItinerary(
    params: GenerateItineraryParams
  ): Promise<LLMItinerary> {
    const client = this.getClient();

    const userContent = JSON.stringify({
      brief: params.brief,
      community_posts: params.rankedPosts.slice(0, 30), // cap context size
      locked_dates: params.lockedDates ?? [],
      // Include booking when present so the model can apply flight/accommodation
      // constraints. Omit the key entirely when there is no booking so the
      // model prompt remains identical to the no-booking path.
      ...(params.booking ? { booking: params.booking } : {}),
    });

    const response = await client.messages.create({
      model: ITINERARY_MODEL,
      max_tokens: 8192,
      system: ITINERARY_SYSTEM_PROMPT,
      // Prefill the assistant turn with "{" so Claude returns raw JSON without a
      // markdown code fence or any preamble.
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" +
      (response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "");

    // Robustly extract the JSON object: strip any markdown fences, then fall
    // back to slicing between the first "{" and the last "}".
    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) jsonStr = fence[1].trim();
    if (!jsonStr.startsWith("{")) {
      const s = jsonStr.indexOf("{");
      const e = jsonStr.lastIndexOf("}");
      if (s !== -1 && e !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    }

    let itinerary: LLMItinerary;
    try {
      itinerary = JSON.parse(jsonStr) as LLMItinerary;
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for itinerary. Raw response:\n${raw}\nParse error: ${err}`
      );
    }

    // Hard cap: the model tends to overshoot the per-day limit even when the
    // prompt asks for 3-4. Enforce it so the plan stays concise and scannable.
    const MAX_ACTIVITIES_PER_DAY = 4;
    if (Array.isArray(itinerary.days)) {
      for (const day of itinerary.days) {
        if (
          Array.isArray(day.activities) &&
          day.activities.length > MAX_ACTIVITIES_PER_DAY
        ) {
          day.activities = day.activities.slice(0, MAX_ACTIVITIES_PER_DAY);
        }
      }
    }

    return itinerary;
  }
}

/**
 * Default provider singleton.
 * The planner engine imports this rather than instantiating directly,
 * making it easy to swap providers in tests.
 */
export const defaultProvider: LLMProvider = new AnthropicProvider();
