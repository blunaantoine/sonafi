import { verifyCode } from "@/lib/access-codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { DayNumber } from "@/lib/sonafi";

/** The Setting.key under which the admin-programmed current day is stored. */
export const DAY_KEY = "currentDay";

/** Admin PIN (see /api/sonafi/auth/verify). */


interface DaySetting {
  day: DayNumber;
  setAt: string;
}

/** Read the admin-programmed current day (defaults to 1). */
export async function getCurrentDay(): Promise<DayNumber> {
  const row = await db.setting.findUnique({ where: { key: DAY_KEY } });
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as DaySetting;
      if (parsed?.day === 1 || parsed?.day === 2 || parsed?.day === 3) {
        return parsed.day;
      }
    } catch {
      /* fall through */
    }
  }
  return 1;
}

/**
 * GET /api/sonafi/day
 * Returns the current day the admin has programmed (shared across all devices).
 * Scanners and the verification team use this instead of picking a day locally.
 */
export async function GET() {
  const day = await getCurrentDay();
  return NextResponse.json({ day });
}

const PutSchema = z.object({
  pin: z.string().min(1),
  day: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/**
 * PUT /api/sonafi/day
 * Body: { pin, day: 1|2|3 }
 *
 * Admin-only (PIN checked server-side). Sets the current day for the whole
 * event — every scanner phone and the verification team pick it up on their
 * next poll of GET /api/sonafi/day.
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
      { success: false, message: "Le jour doit être 1, 2 ou 3." },
      { status: 400 },
    );
  }

  const { pin, day } = parsed.data;
  if (!(await verifyCode("admin", pin))) {
    return NextResponse.json(
      { success: false, message: "Code administrateur incorrect." },
      { status: 401 },
    );
  }

  await db.setting.upsert({
    where: { key: DAY_KEY },
    update: {
      value: JSON.stringify({ day, setAt: new Date().toISOString() }),
    },
    create: {
      key: DAY_KEY,
      value: JSON.stringify({ day, setAt: new Date().toISOString() }),
    },
  });

  return NextResponse.json({
    success: true,
    message: `Jour courant défini sur ${day}.`,
    day,
  });
}
