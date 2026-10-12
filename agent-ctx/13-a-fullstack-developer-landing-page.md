# Task 13-a — Landing page (page 1 of the Sonafi mockup)

**Agent:** full-stack-developer (landing page)
**Scope:** Rebuild `src/components/sonafi/landing-page.tsx` to match
`upload/maquette-pages/page-1.png` using the event's navy / orange / teal
palette from `src/lib/design-tokens.ts`.

## What was done

- Read the shared worklog and the design tokens (`C` and `R`).
- Inspected the existing `landing-page.tsx` (cream/orange theme — did NOT match
  the mockup), the `page.tsx` host (`<main className="mx-auto w-full
  max-w-6xl flex-1 px-4 py-5 sm:px-6">`), and the design tokens.
- Rewrote `landing-page.tsx` from scratch as a mobile-first, max-w-md,
  centered layout that mirrors page 1 of the mockup:

  1. **Header block** (~top 40 %) — navy `C.gestionnaire` background with
     `borderBottomLeftRadius/Right = R.headerBottom` (24 px). Contains:
     - A 44×44 white rounded square (radius 12) holding a navy `QrCode` icon
       (the "QR-style logo" from the mockup).
     - Title "Sonafi" — 34 px, bold, white.
     - Subtitle "Sommet national de la jeune fille" — 17 px, regular, white.
     - Two translucent pill badges on one row: "3 jours" and "500
       participants" — `C.headerTint` (rgba white 0.2) bg, 14 px semibold,
       white text, `R.pill` radius.
  2. **Body** (`px-5 py-6`):
     - Section title "Choisissez votre espace" — 20 px, semibold,
       `C.textPrimary`.
     - 3 stacked white cards (`R.card` 16 px radius, `shadow-sm`): each has
       a 56×56 coloured icon container (radius 14), a bold title + gray
       subtitle, and a gray `ChevronRight` (`C.iconInactive`).
       - Gestionnaire → `LayoutDashboard` / navy `C.gestionnaire` →
         `onSelectAdmin`.
       - Équipe restauration → `Utensils` / orange `C.restauration` →
         `onSelectScanner`.
       - Équipe vérification → `ClipboardCheck` / teal `C.verification` →
         `onSelectVerification`.
  3. **Footer** — centred gray "Accès réservé aux équipes du sommet" (13 px,
     `C.textSecondary`).

- Cards fade in with a staggered framer-motion animation (parent
  `container` variants with `staggerChildren: 0.08, delayChildren: 0.15`;
  each card uses the `item` variants `opacity 0→1, y 12→0, 0.35 s`).
- Outer wrapper uses `-mx-4 sm:mx-auto -my-5` + `max-w-md` so the navy
  header spans the full viewport width on mobile (the host `main` has
  `px-4 sm:px-6 py-5` padding that would otherwise shrink the header) and
  re-centres + caps the width on `sm+` viewports.
- Every colour comes from the `C` token object; every radius from `R`. The
  only hardcoded hex value used is `#FFFFFF` for white text/icon strokes on
  the coloured header (white isn't in the token object).
- No indigo / blue / purple. French text throughout.

## Files touched

- `/home/z/my-project/src/components/sonafi/landing-page.tsx` — overwritten.

## Verification

- `bun run lint` → clean (`$ eslint .`, no warnings or errors).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200`,
  `GET / 200 in 172ms (compile: 52ms, render: 120ms)` in `dev.log`. No
  compile errors emitted.
- `tail dev.log` shows only normal Prisma query logs from the other
  components polling — no errors related to `landing-page.tsx`.

## Notes for the next agent

- The `page.tsx` host wrapper still applies a subtle
  `bg-gradient-to-b from-emerald-50/40 via-background to-background` on its
  outer div, plus `px-4 py-5 sm:px-6` on the `main`. The landing page
  breaks out of the `main`'s padding with `-mx-4 sm:mx-auto -my-5` so the
  navy header sits flush with the viewport edges on mobile. If a future
  task rebuilds `page.tsx`, the negative-margin trick can be removed.
- All three `onSelect*` handlers (`onSelectScanner`, `onSelectVerification`,
  `onSelectAdmin`) are wired through the `handlers` lookup, so the
  existing `page.tsx` calls continue to work unchanged.
