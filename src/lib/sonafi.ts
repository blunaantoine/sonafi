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
