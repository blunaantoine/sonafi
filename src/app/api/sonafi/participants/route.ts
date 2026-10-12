import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/sonafi/participants — list all participants (with optional search). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const limitParam = Number(searchParams.get("limit") ?? "0");
  const limit = limitParam > 0 ? Math.min(limitParam, 1000) : undefined;

  const participants = await db.participant.findMany({
    where: search
      ? {
          OR: [
            { id: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { id: "asc" },
    take: limit,
  });

  const total = await db.participant.count();

  return NextResponse.json({ total, participants });
}

interface ImportBody {
  /** Optional list of {id, name} to upsert. If omitted, the default 500 are seeded. */
  participants?: { id: string; name: string }[];
  /** Optional flag: when true, also seed the 500 default ids if they don't exist. */
  seed?: boolean;
}

/** POST /api/sonafi/participants — bulk import / seed participants. */
export async function POST(req: NextRequest) {
  let body: ImportBody = {};
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    body = {};
  }

  const ops: { id: string; name: string }[] = [];

  if (body.seed) {
    for (let i = 1; i <= 500; i += 1) {
      const id = `ID${String(i).padStart(4, "0")}`;
      ops.push({ id, name: `Participant ${id}` });
    }
  }

  if (Array.isArray(body.participants)) {
    for (const p of body.participants) {
      if (p && typeof p.id === "string" && typeof p.name === "string") {
        ops.push({ id: p.id.trim(), name: p.name.trim() });
      }
    }
  }

  if (ops.length === 0) {
    return NextResponse.json(
      { success: false, message: "Rien à importer." },
      { status: 400 },
    );
  }

  // Upsert so import can be re-run safely (e.g. updating real names).
  const result = await db.$transaction(
    ops.map((op) =>
      db.participant.upsert({
        where: { id: op.id },
        update: { name: op.name },
        create: { id: op.id, name: op.name },
      }),
    ),
    { timeout: 20000 },
  );

  return NextResponse.json({
    success: true,
    message: `${result.length} participant(s) importé(s).`,
    count: result.length,
  });
}
