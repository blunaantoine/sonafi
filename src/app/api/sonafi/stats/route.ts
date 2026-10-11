import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/sonafi/stats — global counts + breakdowns + recent activity. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const recentLimit = Math.min(Number(searchParams.get("recent") ?? "10"), 50);

  const [totalScans, totalParticipants, byDay, byPauseType, recent] =
    await Promise.all([
      db.pause.count(),
      db.participant.count(),
      db.pause.groupBy({
        by: ["day"],
        _count: { _all: true },
        orderBy: { day: "asc" },
      }),
      db.pause.groupBy({
        by: ["pauseType"],
        _count: { _all: true },
      }),
      db.pause.findMany({
        orderBy: { timestamp: "desc" },
        take: recentLimit,
        include: { participant: { select: { id: true, name: true } } },
      }),
    ]);

  // Normalise the day breakdown into a stable 1/2/3 shape.
  const dayCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const row of byDay) dayCounts[row.day] = row._count._all;

  const pauseCounts: Record<string, number> = {
    cafe: 0,
    dejeuner: 0,
    jeux: 0,
  };
  for (const row of byPauseType) pauseCounts[row.pauseType] = row._count._all;

  return NextResponse.json({
    totalScans,
    totalParticipants,
    byDay: dayCounts,
    byPauseType: pauseCounts,
    recent: recent.map((p) => ({
      id: p.id,
      participantId: p.participantId,
      participantName: p.participant.name,
      day: p.day,
      pauseType: p.pauseType,
      timestamp: p.timestamp,
    })),
  });
}
