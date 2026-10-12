import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const PauseSchema = z.object({
  /** The scanned token (random, non-sequential) OR a legacy ID like "ID0042". */
  participantId: z.string().min(1),
  day: z.number().int().min(1).max(10),
  pauseType: z.enum(["cafe", "dejeuner", "jeux"]),
});

/** POST /api/sonafi/pause/record — record a pause, refusing duplicates. */
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

  const parsed = PauseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { participantId, day, pauseType } = parsed.data;

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
    const pause = await db.pause.create({
      data: { participantId: participant.id, day, pauseType },
    });
    return NextResponse.json({
      success: true,
      message: "Pause validée.",
      participant: { id: participant.id, name: participant.name },
      pause: {
        day: pause.day,
        pauseType: pause.pauseType,
        timestamp: pause.timestamp,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 = unique constraint violation -> already taken.
      if (err.code === "P2002") {
        return NextResponse.json(
          {
            success: false,
            message: "Pause déjà enregistrée pour aujourd'hui.",
            code: "already_taken",
            participant: { id: participant.id, name: participant.name },
          },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
