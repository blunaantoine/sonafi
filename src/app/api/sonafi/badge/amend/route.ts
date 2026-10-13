import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyCode } from "@/lib/access-codes";

/**
 * POST /api/sonafi/badge/amend — admin-only scan corrections.
 *
 * The admin can fix a badge that was scanned by mistake (wrong person,
 * accidental double-tap on the scanner, test scan on event day):
 *   · delete_pause  — remove one validated pause (day + pauseType)
 *   · delete_entry  — remove one recorded entry/arrival (day)
 *   · reset_all     — wipe the badge's entire history (pauses + entries)
 *
 * The badge resolves exactly like the scanners do (QR token first, then the
 * human-readable id). The response carries the refreshed history so the
 * client can update its panel in a single round-trip.
 *
 * Body: { pin, code, action, day?, pauseType? }
 *
 * Responses:
 *   200 { success: true, deleted: { pauses, entries }, participant, pauses, entries }
 *   400 { success: false, message }            — invalid body
 *   401 { success: false, message }            — wrong admin code
 *   404 { success: false, message, code: "unknown_participant" }
 */

const PinCode = z.object({
  pin: z.string().min(1),
  code: z.string().min(1),
});

const AmendSchema = z.discriminatedUnion("action", [
  PinCode.extend({
    action: z.literal("delete_pause"),
    day: z.number().int().min(1).max(60),
    pauseType: z.enum(["cafe", "dejeuner"]),
  }),
  PinCode.extend({
    action: z.literal("delete_entry"),
    day: z.number().int().min(1).max(60),
  }),
  PinCode.extend({ action: z.literal("reset_all") }),
]);

export async function POST(req: NextRequest) {
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Corps de requête invalide." },
      { status: 400 },
    );
  }

  const parsed = AmendSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { pin, code, action } = parsed.data;
  if (!(await verifyCode("admin", pin.trim()))) {
    return NextResponse.json(
      { success: false, message: "Code administrateur invalide." },
      { status: 401 },
    );
  }

  const value = code.trim();
  if (!value) {
    return NextResponse.json(
      { success: false, message: "Badge vide." },
      { status: 400 },
    );
  }

  // Same lookup order as the scanners / badge check: QR token first, then id.
  const participant =
    (await db.participant.findUnique({
      where: { token: value },
      select: { id: true, name: true },
    })) ??
    (await db.participant.findUnique({
      where: { id: value },
      select: { id: true, name: true },
    }));

  if (!participant) {
    return NextResponse.json(
      {
        success: false,
        message: "Badge non reconnu.",
        code: "unknown_participant",
      },
      { status: 404 },
    );
  }

  let deletedPauses = 0;
  let deletedEntries = 0;

  if (action === "delete_pause") {
    const r = await db.pause.deleteMany({
      where: {
        participantId: participant.id,
        day: parsed.data.day,
        pauseType: parsed.data.pauseType,
      },
    });
    deletedPauses = r.count;
  } else if (action === "delete_entry") {
    const r = await db.entry.deleteMany({
      where: { participantId: participant.id, day: parsed.data.day },
    });
    deletedEntries = r.count;
  } else {
    // reset_all — wipe the badge's full history.
    const [p, e] = await Promise.all([
      db.pause.deleteMany({ where: { participantId: participant.id } }),
      db.entry.deleteMany({ where: { participantId: participant.id } }),
    ]);
    deletedPauses = p.count;
    deletedEntries = e.count;
  }

  // Refreshed history — same shape (and ordering) as /api/sonafi/badge/check
  // so the client panel can swap its data in place.
  const [pauses, entries] = await Promise.all([
    db.pause.findMany({
      where: { participantId: participant.id },
      orderBy: [{ day: "asc" }, { timestamp: "asc" }],
      select: { day: true, pauseType: true, timestamp: true },
    }),
    db.entry.findMany({
      where: { participantId: participant.id },
      orderBy: [{ day: "asc" }, { timestamp: "asc" }],
      select: { day: true, timestamp: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    deleted: { pauses: deletedPauses, entries: deletedEntries },
    participant,
    pauses,
    entries,
  });
}
