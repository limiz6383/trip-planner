# Trip Planner: UX research brief and design direction

Scope: presentation only (components, page layouts, CSS). No data flow, routes or API changes.
Screenshots: `docs/design/before/` (original) and `docs/design/after/` (redesign), 1280px and 390px.

## How to read this brief

Each pattern is tagged **[found]** (stated in a source I actually fetched) or **[judgement]** (my design
reasoning, informed by those sources but not directly claimed by them). I could not view live products as
images, so descriptions come from articles, store listings and design write-ups, several of which are
secondhand or inferred from screenshot alt text. I also searched for Airbnb, Hopper, Roadtrippers,
Tripadvisor and Notion/Linear-style write-ups, but the results were too thin to cite. Anything I say about
those comes from general design knowledge and is marked as judgement.

Sources used:
- iMore, "Wanderlog iPhone travel app" (itinerary tab, per-day sections, Auto-fill day, Optimize route).
- Stippl, "Stippl vs Wanderlog (2026)" (competitor's view, treat as secondhand).
- Unite.ai, "Best AI tools for travel planning" (Mindtrip, Layla, Wanderlog interaction models).
- ScreensDesign, "Polarsteps" screen catalogue (alt-text summaries, so inferred) and
  "Travel itinerary app design examples" (Plotline, Rhyme, Tripadvisor, TripIt, Layla).
- Skift, "TripIt streamlines itinerary design" (More info / Less info toggle).
- Search Engine Land, "Google Maps gets brighter UI, new category icons and more color-coding".
- SaaSFactor, "Travel mobile app design ideas" (hierarchy, empty states, AI progress, accessibility).

## Patterns worth borrowing

1. **Trip cover header with identity.** [found] Polarsteps pairs a full-bleed cover with trip name, dates and
   a share action on trip cards and the trip summary. Applied: a destination-themed hero (CSS gradient +
   inline SVG sun, hills and dotted route; no photos so the demo works offline), reused as a small cover on
   dashboard cards.
2. **At-a-glance stats.** [found] Polarsteps shows a grid of trip metrics; TripIt added one place to monitor
   cost. Applied: days / cities / activities / estimate strip in the hero, plus a "Trip mix" and
   "Budget by day" panel in a sticky side column on desktop. All derived from the saved itinerary, nothing
   invented.
3. **One container per day.** [found] Wanderlog gives each day its own section you fill and reorder. Applied:
   each day is a card with a day badge, weekday and date, city, stop count and cost.
4. **A stable hierarchy inside each stop.** [found] ScreensDesign: "date, local time, place, duration,
   reservation state and the next move should form a stable hierarchy", and "design the collapsed card for
   decision-making before adding detail". Applied: time rail on the left, then name + type chip, place,
   description, then one meta line (duration, cost, lock state) with actions.
5. **Category colour plus icon.** [found] Google Maps colour-codes categories (food orange/gold, outdoors
   green, shopping blue, entertainment turquoise) and added icons. Applied: eight activity types, each with
   a hue, an icon and a text label, used on the rail dot, chip, mix bar and the dashboard style chips.
   Colour is never the only signal. [judgement: exact hues]
6. **Progressive disclosure.** [found] TripIt hid layover and booking detail behind More info; SaaSFactor
   recommends read-more and collapsed detail. Applied: overview clamps to three lines, destination guides
   start collapsed with a coverage bar in the header, secondary actions (reorder, remove) live behind a
   "more" button on each stop.
7. **Chat beside the plan, edits by conversation.** [found] Mindtrip pairs chat with a visual workspace;
   Layla edits the plan through chat. Applied: "Plan with AI" is a side panel on desktop (the plan stays
   visible while you talk) and scrolls into view on phones. Starter prompt chips are [judgement]: a common
   chat pattern that lowers the blank-box problem. They only fill the input.
8. **Make provenance and state visible.** [found] ScreensDesign: imported, manual and AI-suggested items
   "should not look identical"; TripIt-style history should show who changed what. Applied: violet is
   reserved for anything AI (Revise, Plan with AI), teal for the user's own structure (lock, selected),
   locked stops get a tinted card, guide picks carry "In your plan / Will be added / Will be removed / Locked"
   tags, and "View changes" sits in the main toolbar.
9. **Empty states: illustration, one sentence, one action.** [found] Polarsteps empty states use an
   illustration, a short message and a single CTA; SaaSFactor says every empty or error state needs a next
   action. Applied: dashboard empty state, "no days" state, archived state.
10. **Honest AI progress.** [found] SaaSFactor: show that useful work is happening rather than a bare
    spinner. Applied: an animated route plus skeleton day cards, with the existing "30 to 60 seconds" copy.
    The animation is indeterminate on purpose; we do not know real progress, so we do not fake steps.
11. **Phone navigation and touch targets.** [found] Bottom navigation with five tabs or fewer, 4.5:1 contrast
    (SaaSFactor). Applied: two-tab bottom bar below 640px (the old header hid both links on phones), 44px
    minimum targets, 16px inputs to avoid iOS zoom.
12. **Map next to list.** [found] ScreensDesign and Wanderlog: the list explains order, the map exposes
    distance and clustering. **Not applied**: the UI has no map tiles or coordinates it can show offline.
    I added "free time between stops" cues on the rail as a lightweight stand-in. [judgement]

## Problems in the original UI (see `before/`)

- **Phone header breaks.** At 390px the itinerary toolbar wraps "Plan with AI" into three lines and the
  "Proposed" badge is clipped off the right edge (`before/trip-top-mobile.png`). Nav links are hidden below
  640px with no replacement.
- **Flat hierarchy.** Everything is the same white card in a 640px column. Nothing says "this is your trip"
  (no cover, route or at-a-glance numbers); the itinerary summary is one dense paragraph.
- **Dense, small controls.** Each stop carries up to seven 28px icon buttons plus a type badge, so the
  eye has nowhere to land; touch targets are well under 44px.
- **No timeline logic.** Times are tiny indigo labels; no sense of rhythm, gaps or what is anchored.
- **Destination guide.** A plain checklist with two overlapping signals (checkbox and a 16px dot) and long
  lines of grey text; the whole thing is open by default, pushing the day-by-day plan below the fold.
- **Plan with AI** is squeezed into the header card; the placeholder text is clipped; Apply has no counterpart.
- **Generic look.** Default zinc and indigo, and the body font resolves to Arial (a leftover rule in
  `globals.css`). The dashboard shows one lonely card with a raw status word ("planned").

## Design direction

**Concept: a warm travel journal, not a SaaS dashboard.** [judgement] Paper-toned surfaces, a serif for
display and card titles, a deep Aegean teal as the one brand colour, a violet that means "AI", and a
distinct hue per activity type.

**Palette** (tokens in `app/globals.css`)
- Surfaces: paper `#faf6ee`, card `#fffdf9`, hairlines `#e7dfd0`, ink `#23201b`.
- Brand teal 600/700 `#0f6f7a` / `#0b5963`; sun accent `#e0702f` (logo, demo tag, hero sun only).
- AI: Tailwind violet. Types: food orange, culture plum, outdoor green, shopping rose, transport blue,
  stay indigo, entertainment amber, other stone.
- The legacy `zinc-*` and `indigo-*` scales are re-pointed at warm neutrals and teal, so booking, consulting
  and auth screens inherit the identity without being rewritten.
- Measured contrast: ink on paper 15.1:1; body grey on paper 7.6:1; muted grey on paper 5.5:1; white on
  teal button 5.9:1; all eight type chips 5.9 to 7.4:1; white on violet 5.7:1. Hero text sits on a dark
  scrim (white on the mid gradient alone is 4.7:1).

**Type** (system stacks only, no downloads)
- Display/titles: `Charter, Bitstream Charter, Sitka Text, Cambria, Georgia, serif` at 36 to 60px (trip
  title), 24px section heads, 18 to 20px card titles.
- UI/body: `Inter, system-ui, ...` at 15px body, 12 to 13px meta, 11px uppercase micro-labels.
- Tabular numerals for times and money.

**Spacing and shape.** 4px base. Cards 16 to 20px padding with 20 to 24px between them. Radii: 12px
controls, 16px cards, 24px hero. Wide trip page: 1152px container, content column plus a 336px sticky
side column from 1024px; single column below.

**Motion.** Purposeful and small: 420ms rise-in for dashboard cards, 200ms hover lift, the generating
route animation, smooth scroll for the day strip. All of it is switched off under
`prefers-reduced-motion`.

**Accessibility.** Visible focus rings (teal; violet on AI controls), 44px targets under 640px, real
checkboxes behind the guide cards, `aria-current` on nav and the active day chip, one `h1` per page,
`aria-live` on the chat transcript.

## Deliberately not done

- Real photography and a map view (offline requirement, and no map data in the UI).
- Dark mode. A half-done dark theme is worse than none, so the page declares a light colour scheme.
- Invented copy or numbers: stats, "free time" gaps and budget bars are computed from the itinerary;
  the landing page preview is labelled as a sample.
