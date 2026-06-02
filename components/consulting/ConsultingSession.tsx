"use client";

/**
 * ConsultingSession — AI consulting conversation component.
 *
 * Handles the full conversational UI for gathering trip intent:
 *   1. Chat bubble list (history of ConversationMessages)
 *   2. Text input + send button
 *   3. Calls POST /api/trips/[id]/consult per turn
 *   4. When briefComplete === true: shows a structured TripBrief summary
 *      for confirmation; on confirm calls POST /api/trips/[id]/consult/confirm
 *      then fires onBriefComplete?.()
 *
 * State is kept entirely client-side until the user confirms the brief.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { LLMTripBrief } from "@/lib/types";
import type { ConversationMessage } from "@/lib/llm/provider";
import type {
  ConsultRequestBody,
  ConsultResponseBody,
} from "@/app/api/trips/[id]/consult/route";
import type {
  ConfirmRequestBody,
  ConfirmResponseBody,
} from "@/app/api/trips/[id]/consult/confirm/route";

// ---------------------------------------------------------------------------
// Prop contract — FINAL, do not change
// ---------------------------------------------------------------------------

export interface ConsultingSessionProps {
  /** UUID of the trip being planned */
  tripId: string;
  /** Called when the consulting session produces a completed TripBrief */
  onBriefComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type Phase = "chat" | "review" | "saving" | "done";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Formats a dial value (0.0–1.0) into a human-readable label. */
function dialLabel(value: number): string {
  if (value <= 0.2) return "Very local";
  if (value <= 0.4) return "Mostly local";
  if (value <= 0.6) return "Balanced";
  if (value <= 0.8) return "Mostly touristy";
  return "Very touristy";
}

/** Formats a date string (YYYY-MM-DD) to e.g. "Jun 10, 2025". */
function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    // avoid timezone shift when only a date is given
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// BriefSummary sub-component
// ---------------------------------------------------------------------------

interface BriefSummaryProps {
  brief: Partial<LLMTripBrief>;
}

function BriefSummary({ brief }: BriefSummaryProps) {
  const rows: { label: string; value: string }[] = [
    { label: "Destination", value: brief.destination ?? "—" },
    {
      label: "Dates",
      value:
        brief.start_date && brief.end_date
          ? `${fmtDate(brief.start_date)} — ${fmtDate(brief.end_date)}`
          : "—",
    },
    {
      label: "Daily budget",
      value:
        brief.daily_budget_usd != null
          ? `$${brief.daily_budget_usd.toLocaleString()} / day`
          : "—",
    },
    {
      label: "Vibe",
      value:
        brief.vibe_keywords && brief.vibe_keywords.length > 0
          ? brief.vibe_keywords.join(", ")
          : "—",
    },
    {
      label: "Travellers",
      value: brief.party_composition
        ? [
            brief.party_composition.adults != null
              ? `${brief.party_composition.adults} adult${brief.party_composition.adults !== 1 ? "s" : ""}`
              : null,
            brief.party_composition.children
              ? `${brief.party_composition.children} child${brief.party_composition.children !== 1 ? "ren" : ""}`
              : null,
            brief.party_composition.infants
              ? `${brief.party_composition.infants} infant${brief.party_composition.infants !== 1 ? "s" : ""}`
              : null,
          ]
            .filter(Boolean)
            .join(", ") || "—"
        : "—",
    },
    {
      label: "Local / touristy",
      value:
        brief.local_touristy_dial != null
          ? dialLabel(brief.local_touristy_dial)
          : "—",
    },
    {
      label: "Pace",
      value: brief.pace
        ? brief.pace.charAt(0).toUpperCase() + brief.pace.slice(1)
        : "—",
    },
    {
      label: "Dietary needs",
      value:
        brief.dietary_constraints && brief.dietary_constraints.length > 0
          ? brief.dietary_constraints.join(", ")
          : "None",
    },
    {
      label: "Accessibility",
      value:
        brief.accessibility_needs && brief.accessibility_needs.length > 0
          ? brief.accessibility_needs.join(", ")
          : "None",
    },
  ];

  return (
    <dl className="divide-y divide-zinc-100">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-4 py-2">
          <dt className="shrink-0 text-xs font-medium text-zinc-500">{label}</dt>
          <dd className="text-right text-xs text-zinc-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// ChatBubble sub-component
// ---------------------------------------------------------------------------

interface ChatBubbleProps {
  message: ConversationMessage;
}

function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";

  // Strip any ```json … ``` blocks from assistant messages before rendering
  const displayContent = isUser
    ? message.content
    : message.content.replace(/```json[\s\S]*?```/g, "").trim();

  return (
    <div
      className={[
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-indigo-600 text-white"
            : "rounded-bl-sm bg-zinc-100 text-zinc-900",
        ].join(" ")}
      >
        {displayContent}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator sub-component
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConsultingSession({
  tripId,
  onBriefComplete,
}: ConsultingSessionProps) {
  const [phase, setPhase] = useState<Phase>("chat");
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [partialBrief, setPartialBrief] = useState<Partial<LLMTripBrief>>({});
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Queued sending: the user can keep typing/sending while a turn is in flight.
  // queueRef is the authoritative FIFO of un-started messages; queueView mirrors
  // it for rendering. Refs hold the latest history/brief/phase so the async
  // processor reads current values without stale closures.
  const [queueView, setQueueView] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const briefRef = useRef(partialBrief);
  briefRef.current = partialBrief;
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  // Scroll to bottom whenever the conversation, queue, or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isLoading, queueView]);

  // Reset textarea height when the input is cleared (e.g. after send)
  useEffect(() => {
    if (inputValue === "" && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [inputValue]);

  // Send the first greeting from the assistant when the component mounts
  const hasBootstrapped = useRef(false);
  const bootstrap = useCallback(async () => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    setIsLoading(true);
    setError(null);

    try {
      const reqBody: ConsultRequestBody = {
        userMessage: "Hi, I'd like to plan a trip.",
        history: [],
        partialBrief: {},
      };

      const res = await fetch(`/api/trips/${tripId}/consult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error ?? `Server error ${res.status}`);
      }

      const data = (await res.json()) as ConsultResponseBody;

      // Seed history with the bootstrap exchange
      setHistory([
        { role: "user", content: "Hi, I'd like to plan a trip." },
        { role: "assistant", content: data.assistantMessage },
      ]);
      setPartialBrief(data.partialBrief);

      if (data.briefComplete) {
        setPhase("review");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to start session.";
      setError(msg);
      // Reset so the user can retry
      hasBootstrapped.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Focus input after loading completes
  useEffect(() => {
    if (!isLoading && phase === "chat") {
      inputRef.current?.focus();
    }
  }, [isLoading, phase]);

  // Drains the message queue one turn at a time. Safe to call repeatedly;
  // a single instance runs at once (guarded by processingRef). New messages
  // enqueued mid-flight are picked up because queueRef is read each iteration.
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0 && phaseRef.current === "chat") {
        // Move the next message from the queue into the conversation.
        const message = queueRef.current[0];
        queueRef.current = queueRef.current.slice(1);
        setQueueView([...queueRef.current]);
        setIsLoading(true);

        const base = historyRef.current;
        const optimistic: ConversationMessage[] = [
          ...base,
          { role: "user", content: message },
        ];
        setHistory(optimistic);
        historyRef.current = optimistic;

        try {
          const reqBody: ConsultRequestBody = {
            userMessage: message,
            history: base, // history before this message (server appends it)
            partialBrief: briefRef.current,
          };
          const res = await fetch(`/api/trips/${tripId}/consult`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
          });
          if (!res.ok) {
            const errData = (await res.json()) as { error?: string };
            throw new Error(errData.error ?? `Server error ${res.status}`);
          }
          const data = (await res.json()) as ConsultResponseBody;

          const withAssistant: ConversationMessage[] = [
            ...optimistic,
            { role: "assistant", content: data.assistantMessage },
          ];
          setHistory(withAssistant);
          historyRef.current = withAssistant;
          setPartialBrief(data.partialBrief);
          briefRef.current = data.partialBrief;
          setError(null);

          if (data.briefComplete) {
            setPhase("review");
            phaseRef.current = "review";
            break;
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Something went wrong.";
          setError(msg);
          // Roll back the optimistic message, restore it to the input, and drop
          // any remaining queued messages so the user can retry deliberately.
          setHistory(base);
          historyRef.current = base;
          setInputValue((v) => (v ? v : message));
          queueRef.current = [];
          setQueueView([]);
          break;
        }
      }
    } finally {
      processingRef.current = false;
      setIsLoading(false);
    }
  }, [tripId]);

  // Enqueue a message and kick the processor. Never blocks on an in-flight turn.
  function handleSend() {
    const message = inputValue.trim();
    if (!message) return;
    setInputValue("");
    setError(null);
    queueRef.current = [...queueRef.current, message];
    setQueueView([...queueRef.current]);
    void processQueue();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    // Shift+Enter: allow default behaviour (inserts a newline into the textarea)
  }

  // Handle confirmation — persist the brief, then notify parent
  async function handleConfirm() {
    if (!isCompleteBrief(partialBrief)) return;

    setPhase("saving");
    setSaveError(null);

    try {
      const reqBody: ConfirmRequestBody = { brief: partialBrief as LLMTripBrief };

      const res = await fetch(`/api/trips/${tripId}/consult/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error ?? `Server error ${res.status}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _data = (await res.json()) as ConfirmResponseBody;

      setPhase("done");
      onBriefComplete?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save brief.";
      setSaveError(msg);
      setPhase("review");
    }
  }

  // Return to editing after reviewing the summary
  function handleKeepEditing() {
    setPhase("chat");
    // The conversation continues from where it was
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (phase === "done") {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-900">Trip brief saved!</p>
          <p className="max-w-xs text-xs text-zinc-500">
            Taking you to itinerary generation&hellip;
          </p>
        </div>
      </Card>
    );
  }

  if (phase === "review" || phase === "saving") {
    const isSaving = phase === "saving";

    return (
      <Card>
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50">
              <svg
                className="h-5 w-5 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                Review your trip brief
              </p>
              <p className="text-xs text-zinc-500">
                Confirm to save, or keep editing if something looks off.
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2">
            <BriefSummary brief={partialBrief} />
          </div>

          {/* Save error */}
          {saveError && (
            <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {saveError} — please try again.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSaving}
              onClick={handleKeepEditing}
            >
              Keep editing
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSaving}
              disabled={isSaving}
              onClick={() => void handleConfirm()}
            >
              Confirm &amp; save
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // ---- chat phase ----

  return (
    <Card padded={false}>
      <div className="flex flex-col" style={{ height: "480px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50">
            <svg
              className="h-4 w-4 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">AI Trip Consultant</p>
            <p className="truncate text-xs text-zinc-500">
              Answering your questions to build your trip brief
            </p>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {history.length === 0 && isLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-xs text-zinc-400">Starting session…</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((msg, idx) => (
                <ChatBubble key={idx} message={msg} />
              ))}
              {queueView.map((q, idx) => (
                <ChatBubble
                  key={`queued-${idx}`}
                  message={{ role: "user", content: q }}
                />
              ))}
              {isLoading && <TypingIndicator />}
              {/* Error inline */}
              {error && (
                <div className="flex justify-center">
                  <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    {error}{" "}
                    <button
                      className="underline underline-offset-2 hover:text-red-900"
                      onClick={() => {
                        setError(null);
                        if (history.length === 0) {
                          hasBootstrapped.current = false;
                          void bootstrap();
                        }
                      }}
                    >
                      Retry
                    </button>
                  </p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-zinc-200 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              placeholder="Type your message…"
              value={inputValue}
              rows={1}
              onChange={(e) => {
                setInputValue(e.target.value);
                // Auto-grow: reset to auto first so shrinking works, then
                // expand to scrollHeight up to a ~5-line cap (~120 px).
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              aria-label="Message"
              className={[
                "flex-1 resize-none overflow-y-auto rounded-lg border px-3 py-2.5",
                "text-sm text-zinc-900 placeholder:text-zinc-400 leading-relaxed",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
                "disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed",
                "border-zinc-300 bg-white",
              ].join(" ")}
              style={{ minHeight: "42px", maxHeight: "120px" }}
            />
            <Button
              variant="primary"
              size="md"
              disabled={inputValue.trim() === "" || history.length === 0}
              onClick={handleSend}
              aria-label="Send"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Type guard — ensures every required LLMTripBrief field is present
// ---------------------------------------------------------------------------

function isCompleteBrief(b: Partial<LLMTripBrief>): b is LLMTripBrief {
  return (
    typeof b.destination === "string" &&
    b.destination.trim() !== "" &&
    typeof b.start_date === "string" &&
    b.start_date !== "" &&
    typeof b.end_date === "string" &&
    b.end_date !== "" &&
    typeof b.daily_budget_usd === "number" &&
    Array.isArray(b.vibe_keywords) &&
    b.party_composition != null &&
    typeof b.party_composition.adults === "number" &&
    typeof b.local_touristy_dial === "number" &&
    Array.isArray(b.dietary_constraints) &&
    Array.isArray(b.accessibility_needs) &&
    b.pace != null
  );
}
