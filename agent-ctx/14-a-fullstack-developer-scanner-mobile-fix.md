# Task 14-a — Scanner mobile fix

**Agent**: full-stack-developer (scanner mobile fix)
**File**: `src/components/sonafi/scan-tab.tsx`

## What was fixed

Mobile layout issues in the Restauration scanner tab. See `/home/z/my-project/worklog.md`
for the full record.

## P0 fixes
1. Viewfinder too tall + content clipped
   - Replaced `aspectRatio: "1 / 1"` with `height: "min(50vh, 380px)"` + `minHeight: 240`.
   - Wrapped body in `<div className="flex-1 overflow-y-auto">` so overflow scrolls.
2. Safe-area top: header now has `pt-safe` (clears iPhone notch).
3. Safe-area bottom: `StatsLine` root now has `pb-safe` (clears home indicator).

## P1 fixes
4. Header padding trimmed: `pt-5 pb-6` → `pt-safe pb-4` (+ `safe-x` for landscape).
5. Removed redundant `<h2>Pause en cours</h2>` + section wrapper — card is self-explanatory.
6. Retry button bigger: `min-h-12 px-5 py-2.5 text-base` + `h-5` icon (≥48px touch target).
7. Stats line: `pb-safe` on its root div.

## Root layout change
`<div className="flex flex-col">` → `<div className="flex h-[100dvh] flex-col">`
(dynamic viewport height — handles iOS Safari address-bar resize).

## Notes for downstream agents
- Did NOT touch scan logic, the orange theme (`C.restauration`), `useCurrentDay`,
  `useEffectivePause`, the 4 L-brackets, or the animated scan line.
- `ScanResultOverlay` is `fixed inset-0` so it does not affect the flex column.
- Lint: clean.
