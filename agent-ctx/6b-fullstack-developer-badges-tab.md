# Task 6b — Badges tab

## What I built
- `src/components/sonafi/badge-card.tsx` — single printable badge with QR + branding.
- `src/components/sonafi/badges-tab.tsx` — toolbar (range, print, count, note), responsive
  badge grid (2/3/4 cols), loading skeletons, error & empty states, and an injected
  print stylesheet.

## Key decisions
- **QR payload** = plain participant id string `"ID0042"` (NOT a URL, NOT JSON). The
  Scan tab is expected to scan this exact string.
- Fetch participants **once** on mount via `GET /api/sonafi/participants?limit=0`
  (returns all 500). Built a `Map<id, Participant>` for O(1) lookups when slicing the
  visible range client-side. No refetch on range change.
- Range inputs are controlled strings; clamping is applied to the derived
  `from`/`to` numbers used for slicing only (so the user can clear/typo freely).
- Falls back to `"Participant IDxxxx"` if the API hasn't returned a real name.
- Print layout: 2 cols × 4 rows = ~8 badges per A4 portrait page, `break-inside: avoid`,
  dashed border as cut guide, `print-color-adjust: exact` so the emerald gradient
  header survives printing.
- Hides page chrome (parent `header`, `footer`, shadcn `[role="tablist"]`) and the
  toolbar via the injected `@media print` style + `.sonafi-no-print` class.

## Files
- `src/components/sonafi/badge-card.tsx` (new)
- `src/components/sonafi/badges-tab.tsx` (new)

## Verification
- `bun run lint` — passes clean (no errors in my files).
- `dev.log` — only shows pre-existing errors from sibling tabs not yet created by
  their agents (scan-tab, participants-tab, stats-tab, use-total-scans). No errors
  mention `badges-tab.tsx` or `badge-card.tsx`.
