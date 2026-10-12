import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccessCodes, setAccessCodes, verifyCode } from "@/lib/access-codes";

/**
 * GET /api/sonafi/auth/codes?code=...
 *
 * Admin-only: returns the current access codes. Requires the admin code in
 * the `code` query param so scanners can't read them by simply calling this.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim();
  const ok = await verifyCode("admin", code);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Code administrateur incorrect." },
      { status: 401 },
    );
  }
  const codes = await getAccessCodes();
  return NextResponse.json({ success: true, codes });
}

const PutSchema = z.object({
  code: z.string().min(1), // the admin's current code, to authorize the change
  codes: z.object({
    admin: z.string().min(1),
    restauration: z.string().min(1),
    verification: z.string().min(1),
  }),
});

/**
 * PUT /api/sonafi/auth/codes
 * Body: { code: "<admin code>", codes: { admin, restauration, verification } }
 *
 * Admin-only: updates the three access codes. The admin's current code is
 * re-checked server-side so a scanner can't change codes by editing localStorage.
 */
export async function PUT(req: NextRequest) {
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Corps de requête invalide." },
      { status: 400 },
    );
  }

  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Données invalides." },
      { status: 400 },
    );
  }

  const ok = await verifyCode("admin", parsed.data.code);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Code administrateur incorrect." },
      { status: 401 },
    );
  }

  await setAccessCodes({
    admin: parsed.data.codes.admin.trim(),
    restauration: parsed.data.codes.restauration.trim(),
    verification: parsed.data.codes.verification.trim(),
  });

  return NextResponse.json({
    success: true,
    message: "Codes d'accès mis à jour.",
  });
}
