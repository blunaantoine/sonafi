import { verifyCode } from "@/lib/access-codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { DayNumber } from "@/lib/sonafi";

/** The Setting.key under which the admin-programmed day config is stored. */
export const DAY_KEY = "currentDay";

interface DaySetting {
  /** Explicitly forced current day (1|2|3) — takes priority over dates. */
  day?: DayNumber;
  /** ISO date strings (YYYY-MM-DD) for each summit day. */
  dates?: { 1?: string; 2?: string; 3?: string };
  setAt: string;
}

const DAYS_OF_EVENT: DayNumber[] = [1, 2, 3];

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
  if (cfg?.day === 1 || cfg?.day === 2 || cfg?.day === 3) return cfg.day;

  // 2. Derive from today's date.
  if (cfg?.dates) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    for (const d of DAYS_OF_EVENT) {
      if (cfg.dates[d] && cfg.dates[d] === today) return d;
    }
    // If today is before day 1, still show day 1.
    // If today is after day 3 (or between days), find the latest passed day.
    const configured = DAYS_OF_EVENT.filter((d) => cfg!.dates![d]).sort();
    const todayMs = new Date(today).getTime();
    let lastPassed: DayNumber | null = null;
    for (const d of configured) {
      if (new Date(cfg.dates[d]!).getTime() <= todayMs) lastPassed = d;
    }
    if (lastPassed) return lastPassed;
    // Before the event — default to day 1.
    if (configured.length > 0) return configured[0];
  }

  // 3. Default.
  return 1;
}

/**
 * GET /api/sonafi/day
 * Returns the current day (derived from dates or forced) + the configured dates.
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
  return NextResponse.json({
    day,
    dates: cfg?.dates ?? {},
    forced: cfg?.day != null,
  });
}

const PutSchema = z.object({
  pin: z.string().min(1),
  /** Force the current day (1|2|3). Send null to clear the override and use dates. */
  day: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional(),
  /** ISO date strings (YYYY-MM-DD) for each summit day. */
  dates: z
    .object({
      1: z.string().optional(),
      2: z.string().optional(),
      3: z.string().optional(),
    })
    .optional(),
});

/**
 * PUT /api/sonafi/day
 * Body: { pin, day?: 1|2|3|null, dates?: {1,2,3} }
 *
 * Admin-only (PIN checked server-side). Sets the day configuration:
 *  - `dates` programs which calendar date is jour 1/2/3. The current day then
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

  const { pin, day, dates } = parsed.data;
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
      : "Dates enregistrées.",
    day: currentDay,
    dates: next.dates ?? {},
    forced: next.day != null,
  });
}
