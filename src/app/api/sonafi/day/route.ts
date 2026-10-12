import { verifyCode } from "@/lib/access-codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { MAX_NUMBER_OF_DAYS, makeDays, type DayNumber } from "@/lib/sonafi";

/** The Setting.key under which the admin-programmed day config is stored. */
export const DAY_KEY = "currentDay";

interface DaySetting {
  /** Explicitly forced current day (1..N) — takes priority over dates. */
  day?: DayNumber;
  /** Number of event days (default 3). The dates object may have 1..N keys. */
  numberOfDays?: number;
  /** ISO date strings (YYYY-MM-DD) keyed by day number ("1".."N"). */
  dates?: Record<string, string>;
  setAt: string;
}

/**
 * Read the admin-programmed day config. The current day is resolved as:
 *  1. If `day` is explicitly forced, use it (the admin's manual override).
 *  2. Else if `dates` are configured, derive from today's date.
 *  3. Else default to 1.
 */
export async function getCurrentDay(): Promise<DayNumber> {
  const row = await db.setting.findUnique({ where: { key: DAY_KEY } });
  let cfg: DaySetting | null = null;
  if (row) {
    try {
      cfg = JSON.parse(row.value) as DaySetting;
    } catch {
      cfg = null;
    }
  }

  // 1. Explicit override.
  if (typeof cfg?.day === "number" && cfg.day >= 1 && cfg.day <= MAX_NUMBER_OF_DAYS) {
    return cfg.day;
  }

  // 2. Derive from today's date.
  if (cfg?.dates) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const n = cfg.numberOfDays ?? 3;
    const days = makeDays(n);
    // Exact match first.
    for (const d of days) {
      if (cfg.dates[String(d)] && cfg.dates[String(d)] === today) return d;
    }
    // If today is after some configured dates, return the latest passed one.
    const todayMs = new Date(today).getTime();
    let lastPassed: DayNumber | null = null;
    for (const d of days) {
      const ds = cfg.dates[String(d)];
      if (ds && new Date(ds).getTime() <= todayMs) lastPassed = d;
    }
    if (lastPassed != null) return lastPassed;
    // Before the event — default to day 1.
    const firstConfigured = days.find((d) => cfg!.dates![String(d)]);
    if (firstConfigured != null) return firstConfigured;
  }

  // 3. Default.
  return 1;
}

/** Read the configured number of days (default 3). */
export async function getNumberOfDays(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: DAY_KEY } });
  if (row) {
    try {
      const cfg = JSON.parse(row.value) as DaySetting;
      if (typeof cfg.numberOfDays === "number" && cfg.numberOfDays >= 1 && cfg.numberOfDays <= MAX_NUMBER_OF_DAYS) {
        return cfg.numberOfDays;
      }
    } catch {
      /* ignore */
    }
  }
  return 3;
}

/**
 * GET /api/sonafi/day
 * Returns the current day (derived from dates or forced) + the configured
 * dates + the number of days.
 */
export async function GET() {
  const row = await db.setting.findUnique({ where: { key: DAY_KEY } });
  let cfg: DaySetting | null = null;
  if (row) {
    try {
      cfg = JSON.parse(row.value) as DaySetting;
    } catch {
      cfg = null;
    }
  }
  const day = await getCurrentDay();
  const numberOfDays = cfg?.numberOfDays ?? 3;
  return NextResponse.json({
    day,
    dates: cfg?.dates ?? {},
    forced: cfg?.day != null,
    numberOfDays,
  });
}

const PutSchema = z.object({
  pin: z.string().min(1),
  /** Force the current day (1..N). Send null to clear the override and use dates. */
  day: z.union([z.number().int().min(1).max(MAX_NUMBER_OF_DAYS), z.null()]).optional(),
  /** ISO date strings (YYYY-MM-DD) keyed by day number. */
  dates: z.record(z.string(), z.string()).optional(),
  /** Number of event days (1..10). */
  numberOfDays: z.number().int().min(1).max(MAX_NUMBER_OF_DAYS).optional(),
});

/**
 * PUT /api/sonafi/day
 * Body: { pin, day?: number|null, dates?: Record<string,string>, numberOfDays?: number }
 *
 * Admin-only (PIN checked server-side). Sets the day configuration:
 *  - `numberOfDays` sets how many days the event lasts (default 3). The day
 *    selector + dates adapt to this count.
 *  - `dates` programs which calendar date is jour 1..N. The current day then
 *    auto-derives from today's date — no manual switch needed each morning.
 *  - `day` (optional) forces the current day (the "retard" override). Send
 *    null to clear the override and fall back to the date-based logic.
 */
export async function PUT(req: NextRequest) {
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Corps de requête invalide." },
      { status: 400 },
    );
  }

  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { pin, day, dates, numberOfDays } = parsed.data;
  if (!(await verifyCode("admin", pin))) {
    return NextResponse.json(
      { success: false, message: "Code administrateur incorrect." },
      { status: 401 },
    );
  }

  // Read existing config so we merge (don't wipe dates when only forcing a day).
  const row = await db.setting.findUnique({ where: { key: DAY_KEY } });
  let existing: DaySetting = { setAt: new Date().toISOString() };
  if (row) {
    try {
      existing = JSON.parse(row.value) as DaySetting;
    } catch {
      /* ignore */
    }
  }

  const next: DaySetting = {
    ...existing,
    setAt: new Date().toISOString(),
  };
  if (day !== undefined) {
    next.day = day === null ? undefined : day;
  }
  if (numberOfDays !== undefined) {
    next.numberOfDays = numberOfDays;
    // If reducing the number of days, drop dates beyond the new count.
    if (next.dates) {
      const keep: Record<string, string> = {};
      for (const [k, v] of Object.entries(next.dates)) {
        if (Number(k) <= numberOfDays) keep[k] = v;
      }
      next.dates = keep;
    }
    // If forcing a day beyond the new count, clear the force.
    if (next.day != null && next.day > numberOfDays) {
      next.day = undefined;
    }
  }
  if (dates) {
    next.dates = { ...existing.dates, ...dates };
  }

  await db.setting.upsert({
    where: { key: DAY_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: DAY_KEY, value: JSON.stringify(next) },
  });

  const currentDay = await getCurrentDay();
  return NextResponse.json({
    success: true,
    message: day != null
      ? `Jour courant défini sur ${day}.`
      : numberOfDays != null
        ? `Nombre de jours : ${numberOfDays}.`
        : "Dates enregistrées.",
    day: currentDay,
    dates: next.dates ?? {},
    forced: next.day != null,
    numberOfDays: next.numberOfDays ?? 3,
  });
}
