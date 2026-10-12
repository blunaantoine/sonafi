import { db } from "@/lib/db";
import type { Role } from "@/lib/sonafi";

/** The Setting.key under which the access codes are stored (JSON object). */
export const CODES_KEY = "accessCodes";

export type AccessCodeRole = "admin" | "restauration" | "verification";

interface StoredCodes {
  admin?: string;
  restauration?: string;
  verification?: string;
}

/** Default codes used before the admin configures them (env override supported). */
export const DEFAULT_CODES: StoredCodes = {
  admin: process.env.ADMIN_PIN ?? "sonafi2025",
  restauration: process.env.RESTAURATION_CODE ?? "resto2025",
  verification: process.env.VERIFICATION_CODE ?? "verif2025",
};

/** Read all access codes from the DB, merged with defaults. */
export async function getAccessCodes(): Promise<Required<StoredCodes>> {
  const row = await db.setting.findUnique({ where: { key: CODES_KEY } });
  let stored: StoredCodes = {};
  if (row) {
    try {
      stored = JSON.parse(row.value) as StoredCodes;
    } catch {
      /* ignore corrupt value */
    }
  }
  return {
    admin: stored.admin?.trim() || DEFAULT_CODES.admin,
    restauration: stored.restauration?.trim() || DEFAULT_CODES.restauration,
    verification: stored.verification?.trim() || DEFAULT_CODES.verification,
  };
}

/** Persist the access codes (admin-only — caller must have verified the PIN). */
export async function setAccessCodes(codes: StoredCodes): Promise<void> {
  await db.setting.upsert({
    where: { key: CODES_KEY },
    update: { value: JSON.stringify(codes) },
    create: { key: CODES_KEY, value: JSON.stringify(codes) },
  });
}

/** Verify a code against the configured one for the given role. */
export async function verifyCode(role: AccessCodeRole, code: string): Promise<boolean> {
  const codes = await getAccessCodes();
  const expected = codes[role];
  return code.length > 0 && code === expected;
}
