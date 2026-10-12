/**
 * Sonafi design tokens — the event's colour palette.
 *
 * The mobile mockup uses a role-tinted system (gestionnaire / restauration /
 * vérification), each with its own primary colour. The Sonafi event colours
 * are navy + orange; we keep a teal for the vérification role so the three
 * teams stay visually distinct, plus semantic green/red for success/duplicate
 * full-screen states.
 *
 * Every component that needs a colour imports it from here, so changing the
 * event palette is a one-file edit.
 */

// ---- Neutrals (structural, don't change per event) ------------------------
export const C = {
  pageBg: "#F2F2F7",
  surface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  divider: "#F3F4F6",
  track: "#E5E7EB",
  iconInactive: "#9CA3AF",
  /** Translucent white used on coloured headers (back button, pills). */
  headerTint: "rgba(255,255,255,0.2)",
  /** Dark card used for the camera viewfinder. */
  viewfinder: "#1E1E24",

  // ---- Role colours (the event palette) ----------------------------------
  /** Gestionnaire (admin) — navy, the event's primary brand colour. */
  gestionnaire: "#1E3A6E",
  gestionnaireSoft: "#3D5A8C",
  gestionnaireTint: "#E6EAF2",
  /** Équipe restauration — orange, the event's accent. */
  restauration: "#E8590C",
  restaurationSoft: "#F07A2E",
  restaurationTint: "#FDEEDA",
  /** Équipe vérification — teal (distinct from navy/orange). */
  verification: "#0F766E",
  verificationSoft: "#14B8A6",
  verificationTint: "#D1F5F0",

  // ---- Pause-type accent colours (progress bars on the dashboard) --------
  pauseCafe: "#D9480F",
  pauseDejeuner: "#D9480F",
  pauseJeux: "#7C3AED",
  entriesBar: "#0F766E",

  // ---- Semantic state colours (full-screen overlays) --------------------
  success: "#15803D",
  successSoft: "#22A459",
  successIconBg: "#D1FAE5",
  successIcon: "#10B981",
  warning: "#DC2626",
  warningSoft: "#EF6B6B",
  warningCircle: "#B91C1C",
} as const;

// ---- Layout constants (from the mockup) -----------------------------------
export const R = {
  card: 16,
  headerBottom: 24,
  pill: 999,
} as const;
