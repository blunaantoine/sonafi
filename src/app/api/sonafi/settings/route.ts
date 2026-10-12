import { verifyCode } from "@/lib/access-codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DEFAULT_TOTAL_PARTICIPANTS,
  formatParticipantId,
  parseParticipantId,
} from "@/lib/sonafi";

/** Setting key under which the configured participant count is stored. */
export const TOTAL_KEY = "totalParticipants";

/** Admin PIN (see /api/sonafi/auth/verify). */


/** Reasonable bounds so a typo can't create millions of rows. */
const MIN_PARTICIPANTS = 1;
const MAX_PARTICIPANTS = 10_000;

interface TotalSetting {
  total: number;
  setAt: string;
}

/** Read the configured participant count (defaults to DEFAULT_TOTAL_PARTICIPANTS). */
export async function getConfiguredTotal(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: TOTAL_KEY } });
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as TotalSetting;
      if (Number.isFinite(parsed?.total) && parsed.total >= MIN_PARTICIPANTS) {
        return parsed.total;
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_TOTAL_PARTICIPANTS;
}

/**
 * GET /api/sonafi/settings
 * Returns the configured participant count (and the actual row count, which
 * is usually equal after a sync).
 */
export async function GET() {
  const configured = await getConfiguredTotal();
  const actual = await db.participant.count();
  return NextResponse.json({ totalParticipants: configured, actual });
}

const PutSchema = z.object({
  pin: z.string().min(1),
  totalParticipants: z.number().int().min(MIN_PARTICIPANTS).max(MAX_PARTICIPANTS),
});

/**
 * PUT /api/sonafi/settings
 * Body: { pin, totalParticipants }
 *
 * Admin-only (PIN checked server-side). Sets the configured participant count
 * then syncs the Participant table to match:
 *  - Creates any missing IDs (ID0001..IDxxxx) with placeholder names — existing
 *    participants keep their imported names.
 *  - Removes participants whose numeric index is beyond the new count, but ONLY
 *    if they have no recorded pauses (so scan history is never lost).
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
      {
        success: false,
        message: `Le nombre doit être un entier entre ${MIN_PARTICIPANTS} et ${MAX_PARTICIPANTS}.`,
      },
      { status: 400 },
    );
  }

  const { pin, totalParticipants } = parsed.data;
  if (!(await verifyCode("admin", pin))) {
    return NextResponse.json(
      { success: false, message: "Code administrateur incorrect." },
      { status: 401 },
    );
  }

  // Persist the configured count.
  await db.setting.upsert({
    where: { key: TOTAL_KEY },
    update: {
      value: JSON.stringify({ total: totalParticipants, setAt: new Date().toISOString() }),
    },
    create: {
      key: TOTAL_KEY,
      value: JSON.stringify({ total: totalParticipants, setAt: new Date().toISOString() }),
    },
  });

  // Sync participants inside a transaction.
  const result = await db.$transaction(async (tx) => {
    // 1. Create any missing IDs (1..totalParticipants). Existing rows (with
    //    their real imported names) are left untouched — we only insert the
    //    ones that don't exist yet. (Prisma's SQLite driver doesn't support
    //    createMany skipDuplicates, so we filter first.)
    const existingIds = new Set(
      (
        await tx.participant.findMany({
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const toCreate: { id: string; name: string }[] = [];
    for (let i = 1; i <= totalParticipants; i += 1) {
      const id = formatParticipantId(i);
      if (!existingIds.has(id)) {
        toCreate.push({ id, name: `Participant ${id}` });
      }
    }
    // Chunk createMany to keep the query reasonable (SQLite variable limits).
    const CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await tx.participant.createMany({
        data: toCreate.slice(i, i + CHUNK),
      });
    }

    // 2. Remove participants whose numeric index is beyond the new count, but
    //    only if they have NO pauses (preserve scan history).
    const all = await tx.participant.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const removable = all.filter((p) => {
      const n = parseParticipantId(p.id);
      return !Number.isNaN(n) && n > totalParticipants;
    });
    let removed = 0;
    let keptWithScans = 0;
    for (const p of removable) {
      const hasScans = await tx.pause.findFirst({
        where: { participantId: p.id },
        select: { id: true },
      });
      if (!hasScans) {
        await tx.participant.delete({ where: { id: p.id } });
        removed += 1;
      } else {
        keptWithScans += 1;
      }
    }

    const actual = await tx.participant.count();
    return { removed, keptWithScans, actual };
  });

  return NextResponse.json({
    success: true,
    message: `Nombre de participantes défini sur ${totalParticipants}.`,
    totalParticipants,
    ...result,
  });
}
