"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/sonafi";

const LS_KEY = "sonafi.role";

/** null = landing page (no role chosen yet). */
type RoleOrHome = Role | "home";

function readStoredRole(): RoleOrHome {
  if (typeof window === "undefined") return "home";
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "admin" || v === "scanner" || v === "verification") return v;
  } catch {
    /* ignore */
  }
  return "home";
}

/**
 * Client-side role. The app starts on the landing page ("home"); the user picks
 * one of three roles:
 *  - "scanner"      → restauration team (scans pauses)
 *  - "verification" → verification team (registers daily entries/arrivals)
 *  - "admin"        → gestionnaire (PIN-gated management)
 *
 * Becoming "admin" still requires the PIN via the admin gate; the role in
 * localStorage alone is not enough — the server re-checks the PIN on every
 * privileged action.
 *
 * Hydration-safe: we always render "home" on the first pass (matching the
 * server), then read localStorage in an effect and switch to the stored role.
 * This avoids the "server rendered HTML didn't match the client" mismatch that
 * happens when reading localStorage during initial render.
 */
export function useRole() {
  const [role, setRoleState] = useState<RoleOrHome>("home");

  // After mount, read the stored role so we resume a previous session. This
  // runs after hydration, so the first client render matches the server.
  useEffect(() => {
    setRoleState(readStoredRole());
  }, []);

  // Keep the hook in sync if another tab changes the role.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY) setRoleState(readStoredRole());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setRole = useCallback((r: RoleOrHome) => {
    try {
      if (r === "home") {
        window.localStorage.removeItem(LS_KEY);
      } else {
        window.localStorage.setItem(LS_KEY, r);
      }
    } catch {
      /* ignore */
    }
    setRoleState(r);
  }, []);

  const goHome = useCallback(() => setRole("home"), [setRole]);
  const becomeAdmin = useCallback(() => setRole("admin"), [setRole]);
  const becomeScanner = useCallback(() => setRole("scanner"), [setRole]);
  const becomeVerification = useCallback(() => setRole("verification"), [setRole]);

  return {
    role,
    setRole,
    goHome,
    becomeAdmin,
    becomeScanner,
    becomeVerification,
  };
}
