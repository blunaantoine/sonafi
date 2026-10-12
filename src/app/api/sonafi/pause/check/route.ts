import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const PauseSchema = z.object({
  participantId: z.string().min(1),
  day: z.number().int().min(1).max(10),
  pauseType: z.enum(["cafe", "dejeuner"]),
});

/** POST /api/sonafi/pause/check — is this pause already taken today? */
export async function POST(req: NextRequest) {
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { already_taken: false, message: "Corps de requête invalide." },
      { status: 400 },
    );
  }

  const parsed = PauseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { already_taken: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { participantId, day, pauseType } = parsed.data;
  const existing = await db.pause.findUnique({
    where: {
      participantId_day_pauseType: { participantId, day, pauseType },
    },
    select: { timestamp: true },
  });

  return NextResponse.json({
    already_taken: existing !== null,
    timestamp: existing?.timestamp ?? null,
  });
}
