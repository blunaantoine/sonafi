# Worklog — Sommet Sonafi pause management system

This file is the shared worklog for all agents working on the Sonafi project.
Append (do NOT overwrite) a new section after each task using the template in
the system prompt.

---
Task ID: 1
Agent: main (orchestrator)
Task: Set up the foundation of the Sonafi pause management system (Next.js 16
reimplementation of the Flask `app.py` + French spec `cahier_des_charges_sonafi.md`).

Work Log:
- Read the spec (`upload/cahier_des_charges_sonafi.md`) and the reference Flask
  backend (`upload/app.py`). Key requirements: 500 participants (ID0001..ID0500),
  QR-badge scanning via phone camera, 3 days × 3 pauses (café/déjeuner/jeux),
  duplicate prevention, shared data across phones, green/red feedback.
- Installed `qrcode.react` (badge QR generation) and `html5-qrcode` (camera
  scanning) packages. Dev server confirmed running on port 3000.
- Defined Prisma schema (`prisma/schema.prisma`) with `Participant` and `Pause`
  models. `Pause` has a unique constraint on (participantId, day, pauseType) so
  duplicates are rejected at the DB level. Ran `bun run db:push`.
- Created API routes under `src/app/api/sonafi/`:
  - `GET  /api/sonafi/participants`            — list/search
  - `POST /api/sonafi/participants`            — bulk import + seed 500
  - `GET  /api/sonafi/participants/[id]`       — existence check
  - `POST /api/sonafi/pause/check`             — already-taken check
  - `POST /api/sonafi/pause/record`            — record (rejects duplicates: 409,
                                                unknown participant: 404)
  - `GET  /api/sonafi/stats`                   — totals + byDay + byPauseType
                                                + recent activity
- Seeded the 500 default participants via the API (`{seed: true}`).
- Verified the API end-to-end with curl: duplicate pause returns 409, unknown
  badge returns 404, valid pause returns 200 with participant identity. Then
  cleaned the test record so the DB starts empty for the real event.

Stage Summary:
- Foundation complete. Prisma schema + 5 API endpoints + 500 seeded participants.
- API contract that the frontend MUST use (relative paths, same origin):

  GET  /api/sonafi/participants?search=ID01&limit=200
  POST /api/sonafi/participants        body: { seed?: boolean, participants?: {id,name}[] }
  GET  /api/sonafi/participants/[id]   -> { exists, id?, name? }
  POST /api/sonafi/pause/check         body: { participantId, day:1|2|3, pauseType:"cafe"|"dejeuner"|"jeux" }
                                       -> { already_taken: boolean, timestamp?: string }
  POST /api/sonafi/pause/record        body: { participantId, day, pauseType }
                                       -> 200 { success:true, participant:{id,name}, pause:{day,pauseType,timestamp} }
                                          409 { success:false, code:"already_taken", participant:{id,name} }
                                          404 { success:false, code:"unknown_participant" }
  GET  /api/sonafi/stats?recent=10     -> { totalScans, totalParticipants,
                                            byDay:{1,2,3}, byPauseType:{cafe,dejeuner,jeux},
                                            recent:[{participantId,participantName,day,pauseType,timestamp}] }

- Day values are integers 1/2/3. pauseType values are "cafe" | "dejeuner" | "jeux".
- Participants all exist (ID0001..ID0500) with placeholder names
  "Participant IDxxxx" — the Participants tab must let the user import real names
  (CSV/JSON). Importing re-upserts so existing names are overwritten.
- The only user-visible route is `/` (src/app/page.tsx). Do NOT create other pages.

---
Task ID: 6d
Agent: full-stack-developer (Stats tab)
Task: Built the live Stats dashboard tab (`StatsTab`) — KPI cards, by-pause-type
and by-day breakdowns, recent activity feed, with 5 s auto-refresh while visible
and a loading skeleton.

Work Log:
- Read the worklog foundation + `src/lib/sonafi.ts` (shared types/constants:
  `StatsResponse`, `PauseRecord`, `PAUSE_META`, `PAUSE_TYPES`, `DAYS`,
  `DAY_LABELS`, `formatTimestamp`, `TOTAL_PARTICIPANTS`) and confirmed the
  `/api/sonafi/stats?recent=20` response shape by reading its route.ts.
- Created `src/components/sonafi/stats-tab.tsx` as a single self-contained
  "use client" component (kept everything in one file to avoid cross-file
  coupling with the other parallel agents working in the same folder).
- Implemented a `useStats()` hook: fetches `/api/sonafi/stats?recent=20` on
  mount, polls every 5 s with `setInterval`, skips ticks when
  `document.visibilityState !== "visible"`, and re-fetches on the
  `visibilitychange` event when returning to the tab. Tracks `loading`
  (first load only), `error`, `lastUpdated` and exposes `refetch`.
- Implemented a `useRelativeTime()` hook that re-renders every 1 s so the
  "Mis à jour il y a Xs" label stays fresh without re-fetching.
- Top KPI row (3 cards, `grid-cols-1 sm:grid-cols-3`):
  • Total passages — emerald accent, big tabular-nums number with a subtle
    Framer Motion fade-in on value change.
  • Participantes inscrites — 500 (neutral teal accent).
  • Taux de service potentiel — `totalScans / (TOTAL_PARTICIPANTS * 9)` %
    with a shadcn `Progress` bar (emerald track + emerald fill via
    `[&>div]:bg-emerald-500`).
- "Passages par type de pause" card: custom Tailwind horizontal bars for
  café/dejeuner/jeux, each with emoji + label + count + animated width bar
  (amber/orange/fuchsia via local `PAUSE_BAR` map derived from
  `PAUSE_META`). Shows all three even when 0 (max guard = 1).
- "Passages par jour" card: 3 rows (Jour 1/2/3) with emerald shade bars
  (emerald-400/500/600) and a numbered day badge.
- "Activité récente" card: scrollable `<ul max-h-80 overflow-y-auto>` with
  the latest ~20 scans, newest first. Each row: coloured dot by pause type,
  participant id (mono) + name, day label chip, pause label chip
  (`PAUSE_META.soft`), and `formatTimestamp(timestamp)`. Empty state shows
  "Aucun passage enregistré pour le moment." with an icon.
- Loading skeleton (`StatsSkeleton`) mirroring the final layout (3 KPI
  cards + 2 breakdown cards + activity feed skeletons) shown only on first
  load (`loading && !data`).
- Error state card (red) with a "Réessayer" button if the first fetch
  fails; subsequent fetch failures while data is already present show a
  subtle amber banner so the user keeps seeing stale data.
- Live badge in the header line: pulsing emerald dot + "Mis à jour il y a
  Xs" / "En cours…".
- Mobile-first responsive (`grid-cols-1 sm:grid-cols-3` for KPIs,
  `lg:grid-cols-2` for the breakdowns, full-width activity feed).
- Verified with `bun run lint` (clean) and `bunx tsc --noEmit` — zero
  errors/warnings attributable to my file. The remaining compile errors in
  `dev.log` and `tsc` are from other agents' not-yet-created modules
  (`scan-tab`, `badges-tab`, `participants-tab`, `use-total-scans`) — once
  they land, the `/` route will compile end-to-end.

Stage Summary:
- File created: `src/components/sonafi/stats-tab.tsx` (single file,
  default-exports `StatsTab`, also a named export).
- Imports only from `@/lib/sonafi` (shared) and `@/components/ui/*`
  (Card, Progress, Skeleton) + `framer-motion` + `lucide-react` — no new
  dependencies added.
- Polls `/api/sonafi/stats?recent=20` every 5 s, paused when the tab is
  hidden. One fetch per 5 s — no per-second churn.
- Uses emerald/teal for the global accent and the `PAUSE_META` soft colours
  (amber/orange/fuchsia) for the pause-type chips and bars. No indigo/blue.
- All text French, all numbers `tabular-nums` for smooth visual updates.
- No edits to `page.tsx` (it already imports `StatsTab` from the right
  path). No Prisma changes. No new API routes.

---
Task ID: 6b
Agent: full-stack-developer (Badges tab)
Task: Build the Badges tab — generates 500 printable QR badges for Sommet Sonafi
participants (ID0001..ID0500) with a toolbar (range controls, print button, count,
QR note), responsive on-screen grid, and an A4 print layout with cut guides.

Work Log:
- Read the foundation: `worklog.md` (Task 1), `src/lib/sonafi.ts` (shared constants —
  `formatParticipantId`, `TOTAL_PARTICIPANTS`, `Participant` type), and the spec
  `upload/cahier_des_charges_sonafi.md`.
- Read the parent route `src/app/page.tsx` to confirm `BadgesTab` is imported as a
  named export from `@/components/sonafi/badges-tab` and rendered inside a
  `TabsContent` (so `[role="tablist"]` + `header` + `footer` come from the parent and
  must be hidden in print via the injected stylesheet).
- Created `src/components/sonafi/badge-card.tsx` — a single printable badge:
  emerald/teal gradient header strip ("SOMMET SONAFI" + subtitle "Sommet national
  de la jeune fille"), centered QRCodeSVG (size 120, level "M", value = plain
  participant id string), bold mono id, muted name, emerald footer "3 jours ·
  3 pauses". QR fg is `#0f172a` for max scan reliability; branding is emerald.
- Created `src/components/sonafi/badges-tab.tsx`:
  • Fetches ALL 500 participants once on mount via
    `GET /api/sonafi/participants?limit=0`. Builds a `Map<id, Participant>` for
    O(1) slicing — never refetches on range change.
  • Toolbar Card (`p-4`): range "De"/"à" number inputs (clamped 1..500 via derived
    clamping; raw values stored as strings so users can clear/retype), live count
    "X badges affichés", note "Le contenu du QR est l'identifiant (ex: ID0042).",
    and a primary "Imprimer" button (printer icon) → `window.print()`.
  • Responsive on-screen grid `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3`.
  • Loading state: 8 skeleton badges via the shared `Skeleton` component.
  • Error state: friendly French message with retry hint.
  • Empty state: "Aucune participante à afficher dans cette plage."
  • Falls back to `Participant {id}` if the API has no real name for that id.
- Injected a `<style dangerouslySetInnerHTML>` scoped to `@media print` that:
  • Sets `@page { size: A4 portrait; margin: 10mm }`.
  • Hides `body > div > header`, `body > div > footer`, `header`, `footer`,
    `[role="tablist"]`, and `.sonafi-no-print` (the toolbar).
  • Resets `main`/`[role="tabpanel"]` to full width with no padding.
  • Forces the badge grid to 2 columns × 4 rows = ~8 badges per A4 page with
    `break-inside: avoid` (and the legacy `page-break-inside: avoid`).
  • Each badge gets a dashed border as a cut guide and `print-color-adjust: exact`
    so the emerald gradient header survives printing.
  • QR SVG scales to 28mm × 28mm in print for reliable scanning.
- Verified: `bun run lint` clean. `dev.log` shows only pre-existing errors from
  sibling tabs not yet created by their agents (scan-tab, participants-tab,
  stats-tab, use-total-scans) — no errors mention `badges-tab.tsx` or
  `badge-card.tsx`.

Stage Summary:
- Files created:
  - `src/components/sonafi/badge-card.tsx` (named + default export `BadgeCard`)
  - `src/components/sonafi/badges-tab.tsx` (named + default export `BadgesTab`)
- **QR payload contract**: the QR encodes the plain participant id string, e.g.
  `"ID0042"` — NOT a URL, NOT JSON. The Scan tab (Task 6a) MUST scan this exact
  string and treat it as a participant id. Do not change the payload format.
- API used: `GET /api/sonafi/participants?limit=0` →
  `{ total, participants: {id, name}[] }`. Names default to
  `"Participant IDxxxx"` until imported by the Participants tab (Task 6c).
- Print: 2×4 grid on A4 portrait ≈ 8 badges per page, dashed cut guides,
  `break-inside: avoid`, `print-color-adjust: exact`. The injected stylesheet
  hides the parent header/footer/tabs-list automatically.
- Both files are `"use client"` components using only Tailwind + shadcn/ui
  (`Card`, `Input`, `Button`, `Skeleton`) + `qrcode.react`'s `QRCodeSVG`.
  No indigo/blue used — emerald/teal branding only.
- Next agent (Task 6a Scan tab): the QR value your scanner reads will be a plain
  id string like `"ID0042"`. Pass it directly to the existing
  `GET /api/sonafi/participants/[id]` and `POST /api/sonafi/pause/{check,record}`
  endpoints.

---
Task ID: 6c
Agent: full-stack-developer (Participants tab)
Task: Build the Participants tab of the Sommet Sonafi pause management UI — a
client component `ParticipantsTab` that lets organisers (1) import the real
participant names from a CSV/JSON file, (2) search / view / edit the list of
500 participants. The page.tsx already imports
`{ ParticipantsTab } from "@/components/sonafi/participants-tab"` so the file
must expose both a named and a default export.

Work Log:
- Read the foundation: worklog.md (API contract + seed data), the spec
  `upload/cahier_des_charges_sonafi.md`, and `src/lib/sonafi.ts` (re-used
  `Participant`, `TOTAL_PARTICIPANTS`).
- Inspected existing layout.tsx (Toaster from `@/components/ui/toaster` is
  wired → used the `useToast` hook from `@/hooks/use-toast`) and the shadcn
  primitives already present (card, button, input, table, dialog, badge,
  progress, skeleton, etc.).
- Created 3 files under `src/components/sonafi/`:
  1. `participants-import-card.tsx` — drag-and-drop + click-to-pick file
     picker, hand-rolled CSV parser (quoted fields, `;` fallback when `,`
     yields a single column, header `id,name` required, case-insensitive),
     JSON parser (array of `{id,name}`), preview table of first 5 rows +
     "X participantes seront importées", "Importer" button POSTing
     `{ participants: [...] }` to `/api/sonafi/participants`, "Télécharger un
     modèle CSV" link generating a BOM-prefixed CSV Blob with 3 example rows.
     All errors surfaced as destructive toasts.
  2. `participants-list.tsx` — debounced (~250 ms) client-side search over the
     already-loaded list, scrollable container (`max-h-[28rem] overflow-y-auto`
     with a custom emerald webkit scrollbar), responsive layout (card list on
     mobile `md:hidden`, shadcn `Table` on `md+`), per-row "Modifier" button
     (pencil) opening a Dialog that POSTs a one-element array to upsert the
     single name, "X / 500 avec nom réel" progress header with a Progress bar,
     loading skeleton, empty state, and a Refresh button. A participant is
     considered "named" when `p.name !== \`Participant ${p.id}\`` (matches the
     seed placeholder produced by the POST route).
  3. `participants-tab.tsx` — orchestrator: fetches all 500 via
     `GET /api/sonafi/participants?limit=0` on mount (`cache: "no-store"`),
     holds the shared `{ participants, loading, error }` state, passes a
     `refresh` callback to both children so a successful import or single
     edit re-fetches the list.
- Used emerald as the accent throughout, all labels in French, 44 px+
  touch targets on mobile, no indigo/blue.
- Verified: `bun run lint` passes with zero issues in my files. The dev log
  shows a single remaining compile error, but it concerns
  `@/components/sonafi/use-total-scans` (and the still-missing scan-tab /
  badges-tab / stats-tab created by other agents) — NOT my files. The
  `participants-tab` import on line 9 of page.tsx now resolves correctly.

Stage Summary:
- Files created (all under `src/components/sonafi/`):
  - `participants-tab.tsx`        (orchestrator, default + named export)
  - `participants-import-card.tsx` (file upload, CSV/JSON parse, preview,
    import POST, CSV template download)
  - `participants-list.tsx`        (search, responsive list/table, edit
    dialog, progress header, skeleton, empty state, refresh)
- API usage: `GET /api/sonafi/participants?limit=0` for the list and
  `POST /api/sonafi/participants` for both bulk import and single-name edit
  (one-element array — relies on the upsert behaviour from Task 1).
- Placeholder detection: a participant is "imported/named" iff
  `p.name !== \`Participant ${p.id}\`` (exactly what the seed route produces).
- Next agent must know:
  - The Participants tab is fully functional in isolation; the only page.tsx
    compile errors come from the still-missing `scan-tab`, `badges-tab`,
    `stats-tab` and `use-total-scans` modules (other agents' tasks).
  - I used the `useToast` hook (`@/hooks/use-toast`) — Toaster is already
    rendered in layout.tsx. Do not add a second Toaster.
  - All labels are French; emerald is the accent colour; no indigo/blue.

---
Task ID: 6a
Agent: full-stack-developer (Scan tab)
Task: Built `src/components/sonafi/scan-tab.tsx` — the phone camera scanner used
by food staff to validate participant pauses.

Work Log:
- Read the worklog + spec + `src/lib/sonafi.ts` to reuse the shared vocabulary
  (`PAUSE_META`, `DAYS`, `PAUSE_TYPES`, `DAY_LABELS`, `formatTimestamp`,
  `DayNumber`, `PauseType`). Inspected `html5-qrcode`'s `.d.ts` to confirm the
  exact `Html5Qrcode` class API (`start`, `stop`, `pause`, `resume`, `clear`,
  `getCameras`, `isScanning` field).
- Implemented the component as a single self-contained "use client" file
  (default-exported + named export for consistency with the other sonafi tabs).
  Sub-components `StatusPill` and `ResultOverlay` live at the bottom of the
  same file.
- Day selector (3 big toggle buttons, emerald accent) + pause selector (3 big
  toggle buttons using `PAUSE_META.soft`/`ring` + emoji) — both persist to
  `localStorage` under `sonafi.scan.day` / `sonafi.scan.pauseType` with
  sanitised readers (default Jour 1 / café).
- Camera view: dynamic `import("html5-qrcode")` inside the start effect (avoids
  SSR). Uses `Html5Qrcode.getCameras()` to enumerate, prefers back camera
  (`facingMode: { ideal: "environment" }` when no deviceId is known, otherwise
  `deviceId: { exact }`). Config: `fps: 10`, `qrbox` is a responsive function
  returning 70% of the smaller viewfinder edge. Scan reticle is a custom
  white-corner-brackets + emerald animated scan line overlay (no library UI).
- Scan flow: `handleScan` debounces the same decoded string for 2.5s
  (`lastScanRef`) and guards against concurrent POSTs (`inFlightRef`). It calls
  `recordPause(participantId)` which POSTs to `/api/sonafi/pause/record` with
  the snapshot of the currently selected day/pause (via refs so changing the
  selectors mid-scan doesn't affect an in-flight request).
- Result overlay: full-screen, framer-motion fade + spring-scale-in. Five
  states: `loading` (dark slate + spinner), `success` (emerald + Check, "Pause
  validée"), `duplicate` (rose + X, "Déjà servi(e)"), `unknown` (amber +
  AlertTriangle, "Badge non reconnu"), `error` (slate-700 + WifiOff). Hides
  after ~2.2s then auto-resumes scanning. Vibration patterns: 120ms on
  success, `[60,60,60]` on duplicate/unknown, all guarded by
  `navigator.vibrate?.()` opt-in.
- Camera is paused via `html5Qrcode.pause(true)` while the overlay is showing
  and `resume()`-d when it dismisses (effect keyed on `overlay`).
- Friendly French camera errors: detect `NotAllowedError`, `NotFoundError`,
  `NotReadableError`, insecure-context and translate to short French messages
  + a "Réessayer" button that re-runs `startCamera()`.
- Recent scans list: `max-h-72 overflow-y-auto` with a custom thin webkit
  scrollbar. Each row: solid coloured dot per pause type (amber/orange/fuchsia),
  participant name + monospaced id, day label · pause label · formatted
  timestamp, and a status pill (Validé/Doublon/Inconnu/Erreur). Empty state:
  "Aucun scan pour le moment". Newest first, capped at 12.
- Session counter: "X scans cette session" beside the camera header.
- "Changer de caméra" button (top-right of the camera card) appears only when
  ≥2 cameras were detected; cycles to the next one.
- Cleanup: on unmount, `stop()` then `clear()` the html5-qrcode instance
  inside try/catch, null the ref, clear the resume timer, reset guard refs —
  so the camera stream is never leaked.
- Lint: `bun run lint` is clean (0 errors, 0 warnings) — only one
  `react-hooks/exhaustive-deps` disable was originally needed, removed once
  the rule stopped firing. `tsc --noEmit` reports no errors in scan-tab.tsx
  (the remaining TS errors in the repo come from `page.tsx`'s missing
  `use-total-scans` import and an unrelated Prisma typing issue in
  `participants/route.ts`, both owned by other agents).

Stage Summary:
- Files created:
  - `/home/z/my-project/src/components/sonafi/scan-tab.tsx` (only file).
- Key decisions:
  - Single self-contained file (no `scan-result-overlay.tsx` helper) — keeps
    the overlay state machine local to the parent.
  - `Html5Qrcode` (manual class) rather than `Html5QrcodeScanner` so we keep
    full control of the styling/reticle.
  - Camera "pause" is achieved by `instance.pause(true)` (pauses scanning +
    video) instead of `stop()/start()` — much cheaper on the device and the
    html5-qrcode instance is reused across scans.
  - Day + pause values are mirrored into refs so the (once-created) scan
    callback always uses the latest values without re-creating the camera
    session.
  - All selectors persist to `localStorage` so a refresh mid-pause does not
    lose context.
- Next agent notes:
  - The page won't render until `src/components/sonafi/use-total-scans.tsx`
    (referenced by `src/app/page.tsx`) is created — that's another agent's
    task, NOT mine, and I did not touch `page.tsx` or any other file.
  - `ScanTab` is exported both as named (`export function ScanTab`) and
    default (`export default ScanTab`).

---
Task ID: 5 + 7 (orchestrator)
Agent: main (orchestrator)

Task: Build the page shell + shared constants, then integrate & verify the four
tabs delivered by subagents 6a/6b/6c/6d, and run end-to-end browser verification.

Work Log:
- Created shared vocabulary `src/lib/sonafi.ts` (PauseType, DayNumber, PAUSE_TYPES,
  DAYS, PAUSE_META with French labels + emoji + Tailwind colour tokens, DAY_LABELS,
  formatParticipantId, formatTimestamp, response types).
- Built `src/app/page.tsx`: sticky header (logo + title + live scan counter badge),
  sticky tab bar (Scanner/Badges/Participantes/Statistiques), content area, sticky
  footer with the event tagline. Min-h-screen flex-col layout so the footer sticks
  on short pages and pushes down naturally on long pages.
- Created `src/components/sonafi/use-total-scans.ts` hook (polls /api/sonafi/stats
  every 4s while the Scan tab is active).
- Integrated the four tab components delivered by subagents 6a/6b/6c/6d.
- Fixed two issues found during Agent Browser verification:
  1. `use-total-scans.ts` had not persisted (missing file) → recreated it.
  2. Stats tab KPI card used `teal-100/teal-700` (blue-leaning) → switched to
     `emerald-100/emerald-700` to respect the "no indigo/blue" rule.
  3. Tab bar was not sticky → wrapped TabsList in a sticky container
     (`sticky top-[65px] z-20 bg-background/90 backdrop-blur`) so users can switch
     tabs on mobile without scrolling to the top.
- Agent Browser end-to-end verification (desktop 1280x900 + mobile iPhone 14):
  * Scan tab: renders day selector, pause selector, camera region (graceful
    "Caméra indisponible" + "Réessayer" in headless context), recent scans list.
  * Badges tab: 500 badge cards render with QRCodeSVG (507 SVGs, 501 cards),
    toolbar with De/à range + Imprimer, responsive grid, print stylesheet hides
    chrome and lays out ~8 badges/A4.
  * Participants tab: full 500-row table, search, import + CSV template download,
    edit dialog tested (ID0001 -> "Aïssatou Diallo" saved, toast shown, row
    updated, "1 / 500 avec nom réel" progress correct).
  * Stats tab: KPIs (6 total / 500 inscrites / 0,1% taux), pause-type bars
    (café 3 / déjeuner 2 / jeux 1), day bars (J1=4 / J2=1 / J3=1), recent
    activity feed with 6 entries newest-first, live "Mis à jour à l'instant".
  * Sticky footer present and pushed down naturally on long pages (verified
    bounding box at scroll bottom: top:859 bottom:900 in 900px viewport).
  * Sticky tabs verified on mobile AND desktop (top:73 after scroll).
  * No runtime errors, no console errors, lint clean.
  * Duplicate-prevention verified via curl (409 on re-scan, 404 on unknown badge).
- Cleaned the test data: deleted the 6 verification pauses and reset ID0001's name
  back to "Participant ID0001" so the DB ships pristine (0 pauses, 500 participants).

Stage Summary:
- The Sommet Sonafi pause management system is COMPLETE and browser-verified.
- 500 participants seeded (ID0001..ID0500) with placeholder names.
- All 4 tabs functional. Print-ready badges. CSV/JSON name import. Live stats.
- Emerald/teal palette throughout (no indigo/blue). Mobile-first responsive.
- Sticky header + sticky tab bar + sticky footer.
- To go live: import the real participant names (Participants tab → CSV), print the
  badges (Badges tab → Imprimer), deploy to an HTTPS VPS (camera requires HTTPS).

---
Task ID: 8
Agent: main (orchestrator)
Task: Remove the "jeux" (games) pause — the summit now tracks only 2 pauses/day
(café + déjeuner) instead of 3.

Work Log:
- Removed "jeux" from the shared vocabulary in `src/lib/sonafi.ts`: PauseType
  union, PAUSE_TYPES array, and PAUSE_META map (also dropped the fuchsia palette).
- Updated zod enums in `pause/check` and `pause/record` API routes so "jeux" is
  now a 400 validation error.
- Removed `jeux: 0` default from the stats API route's pauseCounts map.
- Removed `jeux: "bg-fuchsia-500"` from the PAUSE_DOT map in scan-tab.tsx and
  from the PAUSE_BAR + PAUSE_DOT maps in stats-tab.tsx; cleaned the localStorage
  pause validator in scan-tab.tsx.
- Updated POTENTIAL_MAX in stats-tab.tsx (3 days × 2 pauses × 500 = 3000, was 4500).
- Updated copy: badge footer "3 jours · 2 pauses", page footer "2 pauses par jour".
- Since PauseType is derived from PAUSE_TYPES (iterated in the UI), the Scan tab
  pause selector and the Stats tab pause bars now render only café + déjeuner.

Verification:
- `bun run lint` clean.
- API: POST pause/record with pauseType "jeux" → 400; "cafe" → 200.
- /api/sonafi/stats byPauseType shape = {cafe, dejeuner} (no jeux key).
- Browser: Scan tab shows 2 pause buttons (☕ café / 🍽️ déjeuner); Stats tab
  shows 2 pause bars; footer reads "2 pauses par jour". No runtime errors.

Stage Summary:
- The system now manages 2 pauses per day (café + déjeuner) across 3 days.
- 500 participants + 2 pauses/day = 1000 potential scans/day, 3000 total.
- No DB migration needed (pauseType is a free String column); 0 rows in DB.
