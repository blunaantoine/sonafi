# Task 14-b — Verification view mobile fix

## What I did
Fixed the mobile layout issues in
`src/components/sonafi/verification-view.tsx` (the page used by the
vérification team to scan participant badges on phones).

## Issues fixed

### P0 (layout/safe-area)
1. **Root container was static, not flex** → changed
   `mx-auto w-full max-w-md` to
   `mx-auto flex min-h-screen w-full max-w-md flex-col` so the column
   stretches to the viewport height and the manual-ID button can be
   pinned to the bottom with `mt-auto`.
2. **Manual-ID button floated mid-screen** → the body div is now
   `flex flex-1 flex-col gap-4 px-4 pt-4 sm:px-5`, and the button is
   wrapped in `<div className="mt-auto pb-safe">`. `mt-auto` pushes
   the wrapper to the bottom of the flex column (so no more
   ~200 px empty gap below the button), and `pb-safe` keeps the
   button above the iOS home indicator.
3. **Viewfinder too short** → bumped the dark camera card from
   `height: "40vh"` (capped 420 px) to
   `height: "min(55vh, 460px)"` (kept `minHeight: 280` as a floor,
   dropped the now-redundant `maxHeight: 420`). The camera is now the
   dominant element of the screen.
4. **Header hidden behind the notch** → header padding changed from
   `px-4 pb-6 pt-4 sm:px-5 sm:pt-5` to
   `px-4 pb-4 pt-safe sm:px-5`. The `.pt-safe` utility
   (defined in `src/app/globals.css`) is
   `padding-top: calc(env(safe-area-inset-top) + 1.25rem)`, which
   respects the notch on iOS.

### P1 (polish)
5. **Header too tall** → trimmed `pb-6` to `pb-4` (paired with
   `pt-safe` above). Also tightened the title's top margin from
   `mt-4` to `mt-3`.
6. **"Réessayer" button too small** → changed `size="sm"` to
   `size="default"` and added `h-12 px-5 py-2.5 text-base` to the
   className (the default size ships `h-9`, which is only 36 px —
   `h-12` overrides it to 48 px so the tap target is ≥48 px as
   required for touch).
7. **Duplicate "Entrées du jour" subtitle** → the header subtitle
   "Entrées du jour" duplicated the progress-card label
   "Entrées aujourd'hui". Per the task spec's preferred resolution,
   dropped the header subtitle (kept only the title "Vérification")
   and left the progress-card label + count untouched. This also
   makes the header shorter, helping P1 #5.

## Decisions / notes
- Kept the teal theme (`C.verification` = #24AD8D, `C.verificationSoft`
  for the day pill, `C.successIconBg` / `C.successIcon` for the success
  card icon, `C.viewfinder` for the camera card). No new colours
  introduced.
- Day still comes from `useCurrentDay()` (no manual selector). The
  back chevron still calls `goHome()` from `useRole()`.
- Kept the 4 white L-bracket viewfinder reticle, the success card,
  the progress card, the manual-entry `Dialog`, and the
  `VerificationResultOverlay`.
- Wrapped the manual-ID button in a `<div className="mt-auto pb-safe">`
  rather than applying `pb-safe` to the button directly: the button
  has `h-12` (fixed 48 px) + `border-radius: 999` (pill), so applying
  `pb-safe` directly would have distorted its visual height. The
  wrapper absorbs the safe-area padding cleanly while the button
  stays a perfectly round 48 px pill.
- Switched the body div from `space-y-4` to `flex flex-col gap-4`
  because `space-y-4`'s margin-top utility would have conflicted
  with `mt-auto` on the button wrapper (both target margin-top).
  `gap-4` provides the same 16 px rhythm without the conflict.
- Dropped `pb-4` from the body div (kept only `pt-4`): the
  `pb-safe` on the button wrapper now provides all the bottom
  spacing — no double-padding.

## Verification
- `bun run lint` → clean (no errors, no warnings).
- `dev.log` → no verification-view errors; the polling is still
  running (`GET /api/sonafi/stats?recent=0&day=2 200`).
- Did NOT run `bun run build` per the task instructions.
