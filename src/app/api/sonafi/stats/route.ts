import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const VALID_DAYS = new Set([1, 2, 3]);

/** GET /api/sonafi/stats — global counts + breakdowns + recent activity.
 *  Optional ?day=1|2|3 adds per-day detail (entries + each pause for that day). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const recentLimit = Math.min(Number(searchParams.get("recent") ?? "10"), 50);
  const dayParam = Number(searchParams.get("day"));
  const day = VALID_DAYS.has(dayParam) ? dayParam : null;

  const [
    totalScans,
    totalEntries,
    totalParticipants,
    byDay,
    byPauseType,
    recent,
    entriesByDayRows,
    recentEntries,
  ] = await Promise.all([
    db.pause.count(),
    db.entry.count(),
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
    db.entry.groupBy({
      by: ["day"],
      _count: { _all: true },
      orderBy: { day: "asc" },
    }),
    db.entry.findMany({
      orderBy: { timestamp: "desc" },
      take: recentLimit,
      include: { participant: { select: { id: true, name: true } } },
    }),
  ]);

  // Normalise the day breakdown into a stable 1/2/3 shape.
  const dayCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const row of byDay) dayCounts[row.day] = row._count._all;

  const pauseCounts: Record<string, number> = { cafe: 0, dejeuner: 0, jeux: 0 };
  for (const row of byPauseType) pauseCounts[row.pauseType] = row._count._all;

  const entryDayCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const row of entriesByDayRows) entryDayCounts[row.day] = row._count._all;

  // Per-day detail (only when ?day= was provided).
  let dayDetail: { day: number; entries: number; cafe: number; dejeuner: number; jeux: number } | null = null;
  if (day !== null) {
    const [entries, cafe, dejeuner, jeux] = await Promise.all([
      db.entry.count({ where: { day } }),
      db.pause.count({ where: { day, pauseType: "cafe" } }),
      db.pause.count({ where: { day, pauseType: "dejeuner" } }),
      db.pause.count({ where: { day, pauseType: "jeux" } }),
    ]);
    dayDetail = { day, entries, cafe, dejeuner, jeux };
  }

  return NextResponse.json({
    totalScans,
    totalEntries,
    totalParticipants,
    byDay: dayCounts,
    byPauseType: pauseCounts,
    entriesByDay: entryDayCounts,
    recent: recent.map((p) => ({
      id: p.id,
      participantId: p.participantId,
      participantName: p.participant.name,
      day: p.day,
      pauseType: p.pauseType,
      timestamp: p.timestamp,
    })),
    recentEntries: recentEntries.map((e) => ({
      id: e.id,
      participantId: e.participantId,
      participantName: e.participant.name,
      day: e.day,
      timestamp: e.timestamp,
    })),
    dayDetail,
  });
}
