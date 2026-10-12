/**
 * Shared constants & types for the Sommet Sonafi pause management system.
 * Every tab imports from here so the day/pause vocabulary stays consistent.
 */

export type PauseType = "cafe" | "dejeuner";
export type DayNumber = 1 | 2 | 3;

export const PAUSE_TYPES: PauseType[] = ["cafe", "dejeuner"];

export const DAYS: DayNumber[] = [1, 2, 3];

/** Human French labels + Tailwind colour tokens for each pause type. */
export const PAUSE_META: Record<
  PauseType,
  { label: string; emoji: string; accent: string; ring: string; soft: string }
> = {
  cafe: {
    label: "Pause café",
    emoji: "☕",
    accent: "text-amber-700",
    ring: "ring-amber-500",
    soft: "bg-amber-100 text-amber-900 border-amber-200",
  },
  dejeuner: {
    label: "Pause déjeuner",
    emoji: "🍽️",
    accent: "text-orange-700",
    ring: "ring-orange-500",
    soft: "bg-orange-100 text-orange-900 border-orange-200",
  },
};

export const DAY_LABELS: Record<DayNumber, string> = {
  1: "Jour 1",
  2: "Jour 2",
  3: "Jour 3",
};

/** The canonical number of participants at the Sommet Sonafi. */
export const TOTAL_PARTICIPANTS = 500;

// ---- Automatic pause schedule ---------------------------------------------
// The pause type is derived from the wall-clock hour so scanners don't have to
// pick it themselves. Admins can override it (shared across all devices) when
// the schedule runs late.

/** Hour (24h, inclusive) at which the café pause window opens. */
export const CAFE_START_HOUR = 8;
/** Hour (24h, inclusive) at which the café pause ends and déjeuner begins. */
export const DEJEUNER_START_HOUR = 11;

/** Human-readable description of the auto pause windows. */
export const PAUSE_WINDOWS: Record<PauseType, string> = {
  cafe: `De ${CAFE_START_HOUR}h à ${DEJEUNER_START_HOUR}h`,
  dejeuner: `À partir de ${DEJEUNER_START_HOUR}h`,
};

/**
 * Derive the pause type from the current wall-clock hour.
 *  - 8h–11h → café
 *  - 11h and after → déjeuner
 *  - before 8h → café (default, the day hasn't really started)
 */
export function computeAutoPause(now: Date = new Date()): PauseType {
  const h = now.getHours();
  if (h >= DEJEUNER_START_HOUR) return "dejeuner";
  return "cafe";
}

// ---- Roles ------------------------------------------------------------------

export type Role = "scanner" | "admin";

/** Format a numeric index (1..500) as a badge id, e.g. 42 -> "ID0042". */
export function formatParticipantId(n: number): string {
  return `ID${String(n).padStart(4, "0")}`;
}

/** Format an ISO timestamp for French display, e.g. "22/10 09:42". */
export function formatTimestamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

// ---- API response types (must match src/app/api/sonafi/*) ------------------

export interface Participant {
  id: string;
  name: string;
}

export interface PauseRecord {
  id: number;
  participantId: string;
  participantName: string;
  day: DayNumber;
  pauseType: PauseType;
  timestamp: string;
}

export interface StatsResponse {
  totalScans: number;
  totalParticipants: number;
  byDay: Record<string, number>;
  byPauseType: Record<PauseType, number>;
  recent: PauseRecord[];
}

// ---- Effective pause (auto + admin override) --------------------------------

/** Where the currently active pause type came from. */
export type PauseSource = "auto" | "override";

/** Shape returned by GET /api/sonafi/pause/current. */
export interface EffectivePause {
  /** The pause type scanners should use right now. */
  pauseType: PauseType;
  /** "auto" = derived from the clock; "override" = forced by an admin. */
  source: PauseSource;
  /** The pause the clock would suggest (always present, even when overridden). */
  autoPauseType: PauseType;
  /** When the override was set (ISO), only when source === "override". */
  setAt?: string;
}
