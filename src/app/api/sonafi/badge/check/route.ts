import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyCode } from "@/lib/access-codes";

const CheckSchema = z.object({
  /** Admin access code — this endpoint exposes names + history, it is privileged. */
  pin: z.string().min(1),
  /** The scanned QR token (random, non-sequential) OR a typed id like "ID0042". */
  code: z.string().min(1),
});

/**
 * POST /api/sonafi/badge/check — admin-only badge lookup.
 * Body: { pin, code }
 *
 * Resolves the badge exactly like the scanners do (unique token first — the
 * QR content — then the human-readable id for manual entry) and returns the
 * participant with their full history: every validated pause and every
 * recorded entry, ordered by day then time.
 *
 * Responses:
 *   200 { success: true, participant: { id, name }, pauses: [...], entries: [...] }
 *   401 { success: false, message }   — wrong admin pin
 *   404 { success: false, message, code: "unknown_participant" }
 */
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

  const parsed = CheckSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { pin, code } = parsed.data;
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

  // Same lookup order as the pause scanners: QR token first, then badge id.
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
    participant,
    pauses,
    entries,
  });
}
