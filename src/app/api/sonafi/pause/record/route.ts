import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const PauseSchema = z.object({
  participantId: z.string().min(1),
  day: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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

  // Make sure the participant exists.
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { id: true, name: true },
  });
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
      data: { participantId, day, pauseType },
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
