import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/sonafi/participants/[id] — check whether a participant exists. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const participant = await db.participant.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!participant) {
    return NextResponse.json({ exists: false }, { status: 404 });
  }
  return NextResponse.json({ exists: true, ...participant });
}
