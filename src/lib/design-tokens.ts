/**
 * Sonafi design tokens — the event's official colour palette.
 *
 * Source: Charte graphique SONAFI.
 *  - Deep Blue   #0F4180  (Pantone 301 C) — primary, ~70% usage
 *  - Vivid Orange #FF9802  (Pantone 144 C) — accent, ~30% usage
 *  - Black       #0A0909  (Process Black C) — text/contrast
 *  - Sage green  #24AD8D  — support colour, used for the vérification role
 *
 * The role-tinted system maps each team to a colour:
 *  - Gestionnaire → deep blue (the event's primary)
 *  - Restauration → vivid orange (the event's accent)
 *  - Vérification → sage green (a distinct support colour)
 * Plus semantic green/red for success/duplicate full-screen states.
 */

// ---- Neutrals (structural, don't change per event) ------------------------
export const C = {
  pageBg: "#F2F2F7",
  surface: "#FFFFFF",
  textPrimary: "#0A0909",
  textSecondary: "#6B7280",
  divider: "#F3F4F6",
  track: "#E5E7EB",
  iconInactive: "#9CA3AF",
  /** Translucent white used on coloured headers (back button, pills). */
  headerTint: "rgba(255,255,255,0.2)",
  /** Dark card used for the camera viewfinder. */
  viewfinder: "#0A0909",
  /** Cream tint used in the icon background. */
  cream: "#FFF9ED",

  // ---- Role colours (the event palette) ----------------------------------
  /** Gestionnaire (admin) — deep blue, the event's primary colour. */
  gestionnaire: "#0F4180",
  gestionnaireSoft: "#2A5BA8",
  gestionnaireTint: "#E2E8F0",
  /** Équipe restauration — vivid orange, the event's accent. */
  restauration: "#FF9802",
  restaurationSoft: "#FFB84D",
  restaurationTint: "#FFF3E0",
  /** Équipe vérification — sage green (support colour from the charter). */
  verification: "#24AD8D",
  verificationSoft: "#5DC4AA",
  verificationTint: "#D4F0E8",

  // ---- Pause-type accent colours (progress bars on the dashboard) --------
  pauseCafe: "#FF9802",
  pauseDejeuner: "#FF9802",
  pauseJeux: "#0F4180",
  entriesBar: "#24AD8D",

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
