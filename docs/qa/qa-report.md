# QA / PM report: ui-redesign branch

Legend: **ran** = executed (unit test, Playwright in demo mode, curl, build). **read** = code/prompt review only.
Demo mode (`NEXT_PUBLIC_MOCK_MODE=1`, MockProvider) was used throughout. Nothing here was verified against the real model.

## Live tests: NOT RUN
The requested live checks (4-day generation, ripple revision, edit consistency, lat/lon zig-zag, no invented restaurants, `claude-opus-4-5` id validity) were attempted from the sandbox. Every request carrying an API key header was rejected by the sandbox egress proxy (plain-text "Unauthorized", not an Anthropic response). I did not work around it. No key value was read, logged or copied. **Nothing is "verified live".** Those six checks remain open.

## The three reported bugs
| # | Issue | Sev | Found by | Verified | Status |
|---|---|---|---|---|---|
| 1 | Leaving early on last day did not touch previous evening, transfers, budget, bookings | High | read + repro | ran (regex detector + stub-provider tests + Playwright with mock) / model fallback `affects_other_days` read only | Fixed. PM decision: a day edit that changes departure/arrival/transfer escalates to a whole-trip re-plan, shown with a hint while typing, a "Re-plan trip" button and a dismissible banner; logged as a trip-scope change. Day/leg/flight/stay context now passed to every revision prompt. |
| 2 | Totals/per-day/budget/header drifted after edits | High | ran (fixture: day $480 vs activities $105) | ran (unit + Playwright edit/delete/reload) ; Supabase `syncItineraryCosts` read only | Fixed. Activity cost is the single source of truth; day and trip totals derived and re-synced after PATCH/DELETE/move/revise; header shows "$X under/over budget". Budget = per-traveller daily x travellers x days (PM decision, documented in prompts). |
| 3 | Geography: no checks on ordering or multi-city | Med | read | ran (geo.test: haversine, reorder, anchors) ; prompt effect read only | Fixed. Prompts require lat/lon and tidy routes; deterministic reorder (swaps time slots, anchors for meals/transport/locked) and leg validation/alignment. Unresolvable cases add a "Route check" note. |

## Other findings
| Issue | Sev | How | Verified | Status |
|---|---|---|---|---|
| `middleware.ts` deprecated in Next 16 | Med | read docs | ran (build) | Fixed (`proxy.ts`) |
| Fixture title lowercase "greece 2026", stale "$2,460" note, transfer day under wrong city | Low | ran | ran | Fixed |
| Fixture: ferry 08:00 vs flight PAS-ATH 09:30 on 27 Aug | Low | read | read | Not fixed (fixture data, needs a product decision) |
| Landing claim "around real local venues" false in demo | Med | read | ran | Fixed (demo vs live wording) |
| Trip form city move arrows silently undone by server date sort; no overlap/gap validation | Med | ran | ran (tests) | Fixed |
| Activity PATCH accepted garbage (negative cost, bad time) | Med | read | ran (curl) | Fixed |
| Calendar feed 500 with no signing secret; no ICS line folding | Med | read | ran (unit) | Fixed |
| Chat lacked budget/flight/stay context | Low | read | read | Fixed |
| Double-submit on revise/generate | Med | read | read | Best-effort server guard (409) per instance; not safe across instances |
| Changelog drawer: no Escape, no focus trap/return; "View changes" label mismatch; unlabeled revise textarea | Med | read | ran | Fixed |
| Zinc text contrast marginal | Low | computed | read | Fixed (token darkened) |
| No styled 404 / error / loading | Low | read | ran (build, tsc); pages not visually inspected | Fixed (`unstable_retry`) |
| `npm test` ran only osm tests | Med | read | ran | Fixed (46 tests) |
| `docs/design/after/plan-ai-desktop.png` clipped panel | Low | ran | ran | Stale capture (mid-animation); current code renders correctly at 1280x800. Screenshot NOT retaken. README screenshots also stale ("greece 2026", $2,460). |
| Dashboard trip card shows no estimate | Low | read | read | Not fixed (nice-to-have) |
| Auth pages unreachable in demo (redirect to dashboard) | - | ran | ran | Not testable here |

## Checks run
`npm test` 46/46 pass; `npx tsc --noEmit` clean; `next build --webpack` succeeds in demo mode. Playwright sweep covered landing, dashboard, new trip, trip page (1280 and 390), cost edit/delete/reload, ripple flow.

## Not done
axe-core run, full mobile pass of every screen, create-trip consulting flow, Plan-with-AI apply/discard, destination guide, export menu, archive/delete, double-submit race in a browser, retaking screenshots. Read-review of PrePlanFlow, BookingForm, ConsultingSession, auth components was not completed.

## Remaining risks / needs live key
- Whether the real model honors cost units, lat/lon, geography and `affects_other_days` (prompt-only evidence).
- lat/lon accuracy from the model; the venue-index fallback relies on name matches.
- Supabase: `syncItineraryCosts` never run; `replaceDayActivitiesFromLLM` is delete-then-insert (non-atomic).
- In-flight guard is per server instance.
- `daily_budget_usd` per-person semantics is a PM call to confirm.
- `localToday` on new-trip page may risk hydration mismatch.
- Model ids `claude-opus-4-5` / `claude-sonnet-4-5` unverified.
