import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyCode, type AccessCodeRole } from "@/lib/access-codes";

const ROLES = new Set<AccessCodeRole>(["admin", "restauration", "verification"]);

const VerifySchema = z.object({
  role: z.string().optional(),
  // Backward-compat: the admin gate previously sent { pin }.
  pin: z.string().optional(),
  code: z.string().optional(),
});

/**
 * POST /api/sonafi/auth/verify
 * Body: { role: "admin" | "restauration" | "verification", code: string }
 *   OR (legacy admin): { pin: string }   — interpreted as role "admin".
 *
 * Returns: { valid: boolean, role: AccessCodeRole }
 *
 * Verifies the access code for the requested role against the configured value
 * (set by the admin via /api/sonafi/auth/codes). The role itself is only stored
 * in the browser's localStorage; this endpoint merely checks the code. Every
 * privileged action (pause override, day change, settings change) re-validates
 * the admin code server-side, so editing localStorage alone is not enough.
 */
export async function POST(req: NextRequest) {
  let json: Record<string, unknown> = {};
  try {
    json = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const parsed = VerifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const roleRaw = parsed.data.role ?? "admin";
  if (!ROLES.has(roleRaw as AccessCodeRole)) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
  const role = roleRaw as AccessCodeRole;

  const code = (parsed.data.code ?? parsed.data.pin ?? "").trim();
  const valid = await verifyCode(role, code);

  return NextResponse.json({ valid, role }, { status: valid ? 200 : 401 });
}
