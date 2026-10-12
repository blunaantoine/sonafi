import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeAutoPause, type EffectivePause } from "@/lib/sonafi";

/** The Setting.key under which the global pause override is stored. */
export const OVERRIDE_KEY = "pauseOverride";

interface StoredOverride {
  pauseType: "cafe" | "dejeuner" | "jeux";
  setAt: string;
}

/**
 * GET /api/sonafi/pause/current
 * Returns the pause type scanners should use right now:
 *  - "override" if an admin has forced one (shared across all devices),
 *  - "auto" otherwise, derived from the current wall-clock hour.
 *
 * The autoPauseType is always included so the UI can show what the clock
 * suggests even when an override is active.
 */
export async function GET() {
  const autoPauseType = computeAutoPause();

  const row = await db.setting.findUnique({ where: { key: OVERRIDE_KEY } });

  if (row) {
    try {
      const parsed = JSON.parse(row.value) as StoredOverride;
      if (
        parsed?.pauseType === "cafe" ||
        parsed?.pauseType === "dejeuner" ||
        parsed?.pauseType === "jeux"
      ) {
        const body: EffectivePause = {
          pauseType: parsed.pauseType,
          source: "override",
          autoPauseType,
          setAt: parsed.setAt ?? row.updatedAt.toISOString(),
        };
        return NextResponse.json(body);
      }
    } catch {
      /* fall through to auto */
    }
  }

  const body: EffectivePause = {
    pauseType: autoPauseType,
    source: "auto",
    autoPauseType,
  };
  return NextResponse.json(body);
}
