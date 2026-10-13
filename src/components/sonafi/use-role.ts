"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Role } from "@/lib/sonafi";

/** localStorage key holding the active role (exported for the discreet admin
 *  access in page.tsx — /?gestionnaire must not reopen the gate over an
 *  already-active manager session). */
export const LS_KEY = "sonafi.role";

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

// ---------------------------------------------------------------------------
// Module-level singleton store.
//
// HISTORICAL BUG (the "back button doesn't work" report): useRole() used to
// hold the role in a plain useState — meaning EVERY component that called the
// hook owned a PRIVATE copy of the state. ScanTab and VerificationView each
// called useRole() to get `goHome`; tapping their back button updated only
// their own copy (and cleared localStorage), while page.tsx — the component
// that actually decides what renders — never heard about it. The UI stayed on
// the scanner: the button "did nothing".
//
// The fix: one store for the whole app, shared through
// useSyncExternalStore. All hook callers now see the same value and any
// update re-renders every consumer.
// ---------------------------------------------------------------------------

let currentRole: RoleOrHome = "home";
let initialized = false;
const subscribers = new Set<() => void>();

function emitChange() {
  for (const fn of subscribers) fn();
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  currentRole = readStoredRole();

  // Keep the store in sync if another tab changes the role.
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY) return;
    const next = readStoredRole();
    if (next !== currentRole) {
      currentRole = next;
      emitChange();
    }
  });
}

function subscribe(callback: () => void): () => void {
  ensureInit();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Client snapshot — stable between updates (useSyncExternalStore requirement). */
function getSnapshot(): RoleOrHome {
  ensureInit();
  return currentRole;
}

/** Server snapshot — always the landing page (hydration-safe, like before). */
function getServerSnapshot(): RoleOrHome {
  return "home";
}

function setGlobalRole(r: RoleOrHome) {
  try {
    if (r === "home") {
      window.localStorage.removeItem(LS_KEY);
    } else {
      window.localStorage.setItem(LS_KEY, r);
    }
  } catch {
    /* ignore quota / privacy errors */
  }
  if (currentRole !== r) {
    currentRole = r;
    emitChange();
  }
}

/**
 * Client-side role, shared app-wide (see the store note above). The app starts
 * on the landing page ("home"); the user picks one of three roles:
 *  - "scanner"      → restauration team (scans pauses)
 *  - "verification" → verification team (registers daily entries/arrivals)
 *  - "admin"        → gestionnaire (PIN-gated management)
 *
 * Becoming "admin" still requires the PIN via the admin gate; the role in
 * localStorage alone is not enough — the server re-checks the PIN on every
 * privileged action.
 */
export function useRole() {
  const role = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setRole = useCallback((r: RoleOrHome) => {
    setGlobalRole(r);
  }, []);

  const goHome = useCallback(() => setGlobalRole("home"), []);
  const becomeAdmin = useCallback(() => setGlobalRole("admin"), []);
  const becomeScanner = useCallback(() => setGlobalRole("scanner"), []);
  const becomeVerification = useCallback(
    () => setGlobalRole("verification"),
    [],
  );

  return {
    role,
    setRole,
    goHome,
    becomeAdmin,
    becomeScanner,
    becomeVerification,
  };
}
