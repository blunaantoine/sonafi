import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const EntrySchema = z.object({
  participantId: z.string().min(1),
  day: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/**
 * POST /api/sonafi/entries/record
 * Body: { participantId, day: 1|2|3 }
 *
 * Records a daily entry (arrival) checked in by the verification team. Each
 * participant can be checked in once per day — duplicate attempts return 409.
 * Unknown badges return 404.
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

  const parsed = EntrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { participantId, day } = parsed.data;

  // Look up the participant by the scanned value: try the unique token first
  // (the QR content), then fall back to the human-readable id for manual entry.
  const participant =
    (await db.participant.findUnique({
      where: { token: participantId },
      select: { id: true, name: true },
    })) ??
    (await db.participant.findUnique({
      where: { id: participantId },
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

  try {
    const entry = await db.entry.create({
      data: { participantId: participant.id, day },
    });
    return NextResponse.json({
      success: true,
      message: "Entrée enregistrée.",
      participant: { id: participant.id, name: participant.name },
      entry: { day: entry.day, timestamp: entry.timestamp },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 = unique constraint violation -> already checked in today.
      if (err.code === "P2002") {
        return NextResponse.json(
          {
            success: false,
            message: "Déjà enregistrée pour aujourd'hui.",
            code: "already_entered",
            participant: { id: participant.id, name: participant.name },
          },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
