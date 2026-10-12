import { NextRequest, NextResponse } from "next/server";

/**
 * The admin PIN. Override at deploy time with the ADMIN_PIN environment
 * variable so scanners cannot guess it. Defaults to a clearly-placeholder value
 * for local development.
 */
const ADMIN_PIN = process.env.ADMIN_PIN ?? "sonafi2025";

interface VerifyBody {
  pin?: string;
}

/**
 * POST /api/sonafi/auth/verify
 * Body: { pin: string }
 * Returns: { valid: boolean }
 *
 * Used by the admin gate (client PIN dialog). The role itself is only stored in
 * the browser's localStorage; this endpoint merely checks the PIN. The actual
 * privileged action — setting the pause override — re-checks the PIN server-side
 * so a scanner cannot forge it by editing localStorage.
 */
export async function POST(req: NextRequest) {
  let body: VerifyBody = {};
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const valid = pin.length > 0 && pin === ADMIN_PIN;

  return NextResponse.json({ valid }, { status: valid ? 200 : 401 });
}
