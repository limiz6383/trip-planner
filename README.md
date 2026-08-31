# Trip Planner

An LLM-assisted travel planner: describe a trip, get a day-by-day itinerary you
can revise by talking to it. Multi-city trips, flight and accommodation
constraints, per-city destination guides, and a subscribable calendar feed.

Built with Next.js (App Router), Supabase (Postgres + Auth, RLS-enforced), and
the Anthropic API.

## Try it — demo mode

Demo mode runs the whole product with **no API keys, no database, and no
signup**:

```bash
npm install
npm run dev:demo      # http://localhost:3000
```

You land straight in a populated account with a real two-city Greece itinerary
(Paros → Athens) and can click through everything: browse the plan, revise a
day, swap a single activity, chat about the itinerary, generate a new trip.

There is no `.env.local` to create — demo mode is fully self-contained. Every
external dependency is served from fixtures:

| Dependency | Normal mode | Demo mode |
|---|---|---|
| Anthropic API | `AnthropicProvider` | `MockProvider` — synthesises itineraries from the brief |
| Supabase (data) | Postgres via RLS | in-memory store seeded from a real exported trip |
| Supabase (auth) | cookie session | always signed in as a demo user |
| Photon geocoding | live HTTP | local city list |

Demo writes live in memory for the life of the server process and reset on
restart. Nothing is persisted and nothing is billed.

`npm run build:demo` and `npm run start:demo` do the same for a production
build, which is what makes demo mode deployable as a shareable link.

### How the switch works

One flag, `NEXT_PUBLIC_MOCK_MODE=1`, read in `lib/mock/flag.ts` and applied at
four seams:

- `lib/db/queries.ts` picks the real or mock query module at import time, so no
  page, server action, or route handler knows which is live.
- `lib/llm/provider.ts` resolves `defaultProvider` to `MockProvider`.
- `lib/auth/index.ts` returns a fixture user instead of asking Supabase.
- `middleware.ts` skips session refresh and sends `/login` to the dashboard.

Both query modules export the same 38 names, and the dispatcher types the mock
against the real one — if either drifts, the build fails.

## Running against real services

```bash
cp .env.local.example .env.local   # fill in the values
npm install
npm run dev
```

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`.

For a fresh Supabase project, apply `supabase/migrations/` in order
(`0001` … `0007`) plus the `supabase/fix_*.sql` constraints.

> Itinerary generation, revision, chat, and destination guides all bill your
> Anthropic key. Set a spend limit before sharing a non-demo deployment.

See `DEPLOY.md` for deploying to Vercel.
