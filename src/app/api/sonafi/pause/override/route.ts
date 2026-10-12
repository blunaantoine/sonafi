import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeAutoPause } from "@/lib/sonafi";
import { OVERRIDE_KEY } from "@/app/api/sonafi/pause/current/route";

/** The admin PIN (see /api/sonafi/auth/verify). */
const ADMIN_PIN = process.env.ADMIN_PIN ?? "sonafi2025";

const OverrideSchema = z.object({
  pin: z.string().min(1),
  /** Force this pause type. Pass null to clear the override and return to auto. */
  pauseType: z.union([z.literal("cafe"), z.literal("dejeuner"), z.literal("jeux"), z.null()]),
});

/**
 * POST /api/sonafi/pause/override
 * Body: { pin: string, pauseType: "cafe" | "dejeuner" | null }
 *
 * Admin-only (PIN checked server-side). When pauseType is null the override is
 * cleared so scanners fall back to the automatic, clock-based pause. The
 * override is stored in the shared database so every scanner phone picks it up
 * on its next poll of /api/sonafi/pause/current.
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

  const parsed = OverrideSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const { pin, pauseType } = parsed.data;

  if (pin !== ADMIN_PIN) {
    return NextResponse.json(
      { success: false, message: "Code administrateur incorrect." },
      { status: 401 },
    );
  }

  // Clear the override.
  if (pauseType === null) {
    await db.setting.delete({ where: { key: OVERRIDE_KEY } }).catch(() => {
      /* already absent — fine */
    });
    return NextResponse.json({
      success: true,
      message: "Pause automatique rétablie.",
      pauseType: computeAutoPause(),
      source: "auto",
    });
  }

  // Set the override.
  const value = JSON.stringify({
    pauseType,
    setAt: new Date().toISOString(),
  });
  await db.setting.upsert({
    where: { key: OVERRIDE_KEY },
    update: { value },
    create: { key: OVERRIDE_KEY, value },
  });

  const label =
    pauseType === "cafe" ? "café" : pauseType === "dejeuner" ? "déjeuner" : "jeux";
  return NextResponse.json({
    success: true,
    message: `Pause forcée : ${label}.`,
    pauseType,
    source: "override",
  });
}
