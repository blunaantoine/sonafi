"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/sonafi";

const LS_KEY = "sonafi.role";

function readRole(): Role {
  if (typeof window === "undefined") return "scanner";
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "admin") return "admin";
  } catch {
    /* ignore */
  }
  return "scanner";
}

/**
 * Client-side role. Default is "scanner" — the mode every food agent lands in.
 * Becoming "admin" requires entering the PIN via the admin gate; the gate calls
 * /api/sonafi/auth/verify server-side so the role can't be faked by editing
 * localStorage (the privileged override action re-checks the PIN server-side).
 */
export function useRole() {
  const [role, setRoleState] = useState<Role>(readRole);

  // Keep the hook in sync if another tab changes the role.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY) setRoleState(readRole());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setRole = useCallback((r: Role) => {
    try {
      window.localStorage.setItem(LS_KEY, r);
    } catch {
      /* ignore */
    }
    setRoleState(r);
  }, []);

  const becomeAdmin = useCallback(() => setRole("admin"), [setRole]);
  const becomeScanner = useCallback(() => setRole("scanner"), [setRole]);

  return { role, setRole, becomeAdmin, becomeScanner };
}
