import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/sonafi/export?format=csv
 * Downloads a CSV of all pauses + entries (the admin "Exporter" feature).
 *
 * Two sections, separated by a blank line:
 *  1. Passages (participantId, name, day, pauseType, timestamp)
 *  2. Entrées  (participantId, name, day, timestamp)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "csv";

  const [pauses, entries] = await Promise.all([
    db.pause.findMany({
      orderBy: [{ day: "asc" }, { timestamp: "asc" }],
      include: { participant: { select: { name: true } } },
    }),
    db.entry.findMany({
      orderBy: [{ day: "asc" }, { timestamp: "asc" }],
      include: { participant: { select: { name: true } } },
    }),
  ]);

  if (format === "json") {
    return NextResponse.json({
      pauses: pauses.map((p) => ({
        participantId: p.participantId,
        name: p.participant.name,
        day: p.day,
        pauseType: p.pauseType,
        timestamp: p.timestamp,
      })),
      entries: entries.map((e) => ({
        participantId: e.participantId,
        name: e.participant.name,
        day: e.day,
        timestamp: e.timestamp,
      })),
    });
  }

  // CSV
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines: string[] = [];

  lines.push("section,participant_id,nom,jour,type_pause,horodatage");
  for (const p of pauses) {
    lines.push(
      [
        "passage",
        p.participantId,
        p.participant.name,
        String(p.day),
        p.pauseType,
        new Date(p.timestamp).toISOString(),
      ]
        .map(esc)
        .join(","),
    );
  }
  for (const e of entries) {
    lines.push(
      [
        "entree",
        e.participantId,
        e.participant.name,
        String(e.day),
        "",
        new Date(e.timestamp).toISOString(),
      ]
        .map(esc)
        .join(","),
    );
  }

  const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel UTF-8
  const dateStr = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sonafi_export_${dateStr}.csv"`,
    },
  });
}
