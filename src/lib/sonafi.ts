/**
 * Shared constants & types for the Sommet Sonafi pause management system.
 * Every tab imports from here so the day/pause vocabulary stays consistent.
 */

export type PauseType = "cafe" | "dejeuner" | "jeux";
/** A summit day, 1..N (the admin configures N, the number of days). */
export type DayNumber = number;

export const PAUSE_TYPES: PauseType[] = ["cafe", "dejeuner", "jeux"];

/** Default number of event days (the admin can change it). */
export const DEFAULT_NUMBER_OF_DAYS = 3;
/** Upper bound so a typo can't create a huge day list. */
export const MAX_NUMBER_OF_DAYS = 10;

/** Build the day list [1..n]. */
export function makeDays(n: number): DayNumber[] {
  const count = Math.min(Math.max(1, Math.trunc(n)), MAX_NUMBER_OF_DAYS);
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** The default 3-day list (kept for backwards compatibility). */
export const DAYS: DayNumber[] = makeDays(DEFAULT_NUMBER_OF_DAYS);

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
  jeux: {
    label: "Pause des jeux",
    emoji: "🎯",
    accent: "text-fuchsia-700",
    ring: "ring-fuchsia-500",
    soft: "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200",
  },
};

export const DAY_LABELS: Record<DayNumber, string> = {
  1: "Jour 1",
  2: "Jour 2",
  3: "Jour 3",
};

/**
 * The default number of participants. The actual count is admin-configurable
 * and stored in the database (Setting key "totalParticipants"); use
 * /api/sonafi/settings to read or change it at runtime. This constant is only
 * the fallback used before the first configuration and as the upper clamp.
 */
export const DEFAULT_TOTAL_PARTICIPANTS = 500;

/** Backwards-compatible alias kept for the (few) places that need a constant. */
export const TOTAL_PARTICIPANTS = DEFAULT_TOTAL_PARTICIPANTS;

// ---- Automatic pause schedule ---------------------------------------------
// The pause type is derived from the wall-clock hour so scanners don't have to
// pick it themselves. Admins can override it (shared across all devices) when
// the schedule runs late.

/** Hour (24h, inclusive) at which the café pause window opens. */
export const CAFE_START_HOUR = 8;
/** Hour (24h, inclusive) at which the café pause ends and déjeuner begins. */
export const DEJEUNER_START_HOUR = 11;
/** Hour at which the jeux pause begins (afternoon). */
export const JEUX_START_HOUR = 15;

/** Human-readable description of the auto pause windows. */
export const PAUSE_WINDOWS: Record<PauseType, string> = {
  cafe: `De ${CAFE_START_HOUR}h à ${DEJEUNER_START_HOUR}h`,
  dejeuner: `De ${DEJEUNER_START_HOUR}h à ${JEUX_START_HOUR}h`,
  jeux: `À partir de ${JEUX_START_HOUR}h`,
};

/**
 * Derive the pause type from the current wall-clock hour.
 *  - 8h–11h → café
 *  - 11h–15h → déjeuner
 *  - 15h and after → jeux
 *  - before 8h → café (default, the day hasn't really started)
 */
export function computeAutoPause(now: Date = new Date()): PauseType {
  const h = now.getHours();
  if (h >= JEUX_START_HOUR) return "jeux";
  if (h >= DEJEUNER_START_HOUR) return "dejeuner";
  return "cafe";
}

// ---- Roles ------------------------------------------------------------------

export type Role = "scanner" | "admin" | "verification";

/** Format a numeric index (1..N) as a badge id, e.g. 42 -> "ID0042". */
export function formatParticipantId(n: number): string {
  return `ID${String(n).padStart(4, "0")}`;
}

/** Inverse of formatParticipantId: "ID0042" -> 42. Returns NaN if not an id. */
export function parseParticipantId(id: string): number {
  const m = /^ID0*(\d+)$/.exec(id.trim());
  return m ? Number(m[1]) : NaN;
}

// ---- Random participant IDs (non-guessable) --------------------------------
// Each participant gets a random 5-character alphanumeric ID (e.g. "0R1DF",
// "3RE5D") instead of a sequential "ID0042". This makes the badge ID itself
// non-guessable, so a fraudster can't enumerate participants.

/** Unambiguous alphabet (no 0/O/1/I/L) for readable codes. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_LENGTH = 5;

/** Fill a Uint32Array with cryptographically random values (fallback: Math.random). */
function randomBytes(length: number): Uint32Array {
  const arr = new Uint32Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i += 1) arr[i] = Math.floor(Math.random() * 0xffffffff);
  }
  return arr;
}

/** Generate a random 5-char participant id, e.g. "0R1DF". */
export function generateId(): string {
  const arr = randomBytes(ID_LENGTH);
  let out = "";
  for (let i = 0; i < ID_LENGTH; i += 1) {
    out += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  }
  return out;
}

// ---- Participant tokens (QR content) ---------------------------------------
// The QR code on each badge encodes a random, non-sequential token (longer
// than the id) so badges can't be guessed or duplicated. The human-readable id
// ("0R1DF") is shown on the badge for management; the scanned value is the
// secret token.

const TOKEN_LENGTH = 8;

/** Generate a random participant token, e.g. "K7Q2M9XH". */
export function generateToken(): string {
  const arr = randomBytes(TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    out += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  }
  return out;
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
  /** Random, non-guessable token encoded in the QR code. */
  token?: string;
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

export interface EntryRecord {
  id: number;
  participantId: string;
  participantName: string;
  day: DayNumber;
  timestamp: string;
}

/** Per-day breakdown (entries + each pause type for one day). */
export interface DayDetail {
  day: DayNumber;
  entries: number;
  cafe: number;
  dejeuner: number;
  jeux: number;
}

export interface StatsResponse {
  totalScans: number;
  totalEntries: number;
  totalParticipants: number;
  byDay: Record<string, number>;
  byPauseType: Record<PauseType, number>;
  entriesByDay: Record<string, number>;
  recent: PauseRecord[];
  recentEntries: EntryRecord[];
  dayDetail: DayDetail | null;
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
