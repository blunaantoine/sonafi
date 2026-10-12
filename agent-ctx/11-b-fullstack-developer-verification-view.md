# Task 11-b — full-stack-developer (verification view)

## Task
Create `src/components/sonafi/verification-view.tsx` — the full-screen daily
check-in scanner used by the **vérification** team. Distinct from the pause
scanner (`scan-tab.tsx`): no pause type, only "did this participant arrive on
day X". Emerald accent (vs. the pause scanner's amber/orange), calls
`POST /api/sonafi/entries/record`.

## Work Log
- Read `worklog.md` (full project context), `src/lib/sonafi.ts` (shared
  constants), and the existing `src/components/sonafi/scan-tab.tsx` as the
  reference pattern (camera flow, day selector, recent list, overlay, refs,
  cleanup).
- Confirmed the `entries/record` API (`src/app/api/sonafi/entries/record/route.ts`)
  matches the contract: 200 success, 409 `already_entered`, 404
  `unknown_participant`. No backend work needed.
- Wrote `verification-view.tsx`:
  - `"use client"` default export `VerificationView`.
  - Header card (emerald accent): "Enregistrement des entrées" + subtitle +
    `ClipboardCheck` icon + current day chip.
  - Day selector (3 toggle buttons, Jour 1 default, persisted to
    `localStorage` key `sonafi.verification.day`). Ref-mirrors day so the
    once-created scan callback always sees the latest value.
  - Camera: html5-qrcode dynamic-imported; `facingMode: { ideal: "environment" }`,
    `fps: 10`, responsive qrbox (min 160px, 70% of min edge). Auto-start on
    mount, stop+clear on unmount. White corner-bracket reticle + emerald
    scanning line (framer-motion). Graceful camera-error card with "Réessayer".
  - Scan flow: 2.5s debounce on same code → `POST /api/sonafi/entries/record`.
    Full-screen result overlay (~2.2s) with framer-motion fade/scale:
      * Green (200): big `Check`, "Entrée enregistrée", name + id + day.
        Vibrate 120ms.
      * Red (409): big `X`, "Déjà enregistrée aujourd'hui", name + day.
        Vibrate `[60,60,60]`.
      * Amber (404): `AlertTriangle`, "Badge non reconnu", raw id.
        Vibrate `[60,60,60]`.
      * Gray (err/throw): `WifiOff`, "Erreur, réessayez".
    Camera pauses while overlay shows, resumes after.
  - Recent entries list: `max-h-72 overflow-y-auto` with custom webkit
    scrollbar; ~12 entries this session; each row emerald dot + id (mono) +
    name + day label + timestamp + status pill (Enregistrée / Doublon / Inconnu
    / Erreur). Newest first. Empty state "Aucune entrée pour le moment".
  - Session counter: "X entrée(s) cette session".
- Guarded against double-start (`inFlightRef`), single mount effect, cleanup
  stops then clears the html5-qrcode instance.

## Verification
- `bun run lint` — clean (0 errors, 0 warnings).
- `dev.log` — no compile errors mentioning `verification-view`.

## Stage Summary
- Files created:
  - `src/components/sonafi/verification-view.tsx` (~620 lines, default export
    `VerificationView`).
- Key decisions:
  - Emerald accent throughout (distinct from pause scanner's amber/orange).
  - No pause selector / no PauseBadge — verification only cares about
    day + arrival, not pause type.
  - localStorage key `sonafi.verification.day` (separate from
    `sonafi.scan.day` so the two roles keep their own day preference).
  - Mirrors scan-tab's camera lifecycle / overlay / recent-list patterns for
    consistency, but stripped of pause logic and themed emerald.
- Ready for the integrator (Task 11 main) to wire into the role-based page
  shell under the "vérification" role.
