# Deploying trip-planner (share with friends)

This is a Next.js app backed by Supabase (Postgres + Auth) and the Anthropic
API. To let friends try it, deploy it to **Vercel** (free tier is fine) and
point it at your existing Supabase project. Friends just visit the URL and sign
up — each person only sees their own trips (enforced by Postgres RLS).

## 1. Push to GitHub
Already on `github.com/limiz6383/trip-planner` (branch `main`).

## 2. Import to Vercel
1. vercel.com → **Add New… → Project** → import `limiz6383/trip-planner`.
2. Framework preset: **Next.js** (auto-detected). Leave build/output defaults.
3. Add the **Environment Variables** below, then **Deploy**.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)
Copy the values from your local `.env.local`:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase (public anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase — **secret**, server only |
| `ANTHROPIC_API_KEY` | your Anthropic key — **secret** |
| `NEXT_PUBLIC_SITE_URL` | set to the deployed URL, e.g. `https://trip-planner.vercel.app` |
| `CRON_SECRET` | any long random string (`openssl rand -hex 32`) — **secret**; see §6 |

> First deploy: set `NEXT_PUBLIC_SITE_URL` to the URL Vercel gives you, then
> **redeploy**. It's used for calendar-subscribe links and auth redirects.

## 4. Point Supabase Auth at the deployed URL
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://<your-vercel-domain>`
- **Redirect URLs**: add `https://<your-vercel-domain>/auth/callback`

Without this, friends' sign-up / login / email confirmation will fail.

## 5. Database migrations
Your Supabase already has these applied. For a **fresh** Supabase project, run
the SQL in `supabase/migrations/` in order (SQL editor):
`0001_init.sql` → `0002` airports* → `0003` sort_order → `0004` start_time →
`0005` destination_guide → `0006` trip_legs → `0007` flights_accommodations.
(Plus the `supabase/fix_*.sql` constraints.)

## 6. Keep the free Supabase project awake
Supabase pauses Free-plan projects after **7 days with no database activity**.
A paused project stays restorable from the dashboard for a limited window, but
the live app is down until someone resumes it.

`vercel.json` schedules a **Vercel Cron** that calls `/api/keepalive` once a
day (15:00 UTC). The route runs one `head` count on `trips` — a real Postgres
query that returns no rows — so the project always has recent activity.

- Set `CRON_SECRET` in Vercel (step 3). Vercel sends it as
  `Authorization: Bearer …`; every other caller gets `401`.
- Crons only run on the **production** deployment. After deploying, check
  Vercel → Project → **Settings → Cron Jobs**, where you can also hit
  **Run** once to confirm it returns `{"ok":true,…}`.
- If the project is **already paused**, resume it in the Supabase dashboard
  first; the cron keeps it awake but cannot wake it.
- Demo-mode deployments have no database, so the route just reports `skipped`.

## Deploying the demo instead (no keys, no cost)

To share a link that costs nothing and cannot break when Supabase sleeps, set
`NEXT_PUBLIC_MOCK_MODE=1` in the Vercel environment variables and leave every
other variable unset. The build is self-contained — no database, no Anthropic
key, no signup — so there is nothing to keep warm and nothing to bill.

Note that demo writes are per-instance and in-memory, so a visitor's changes do
not survive across serverless instances. That is fine for a walkthrough; do not
present it as persistence.

## ⚠️ Cost — read before sharing widely
Every itinerary **generate / revise / day-revise / activity-revise / chat /
destination guide** call uses **your** `ANTHROPIC_API_KEY` — so friends' usage
is billed to **you**. The calendar feed and normal browsing cost nothing
(DB reads only). Before sharing broadly:
- Set a **spend limit** on your Anthropic account.
- Consider sharing with a small group first.

## Local dev
`cp .env.local.example .env.local` (fill values) → `npm install` → `npm run dev`.
