"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EffectivePause } from "@/lib/sonafi";

const POLL_MS = 4_000;

/**
 * Polls /api/sonafi/pause/current so every scanner phone picks up an admin
 * override within a few seconds. Pauses polling when the tab is hidden to save
 * requests, and re-fetches immediately when the tab becomes visible again.
 *
 * Exposes `refetch` so the admin override bar can force an immediate refresh
 * right after it sets/clears the override (no need to wait for the next poll).
 */
export function useEffectivePause() {
  const [pause, setPause] = useState<EffectivePause | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/sonafi/pause/current", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EffectivePause;
      if (!cancelledRef.current) {
        setPause(data);
        setError(null);
      }
    } catch {
      if (!cancelledRef.current)
        setError("Impossible de charger la pause en cours.");
    } finally {
      if (
        !cancelledRef.current &&
        document.visibilityState === "visible"
      ) {
        timerRef.current = setTimeout(fetchOnce, POLL_MS);
      }
    }
  }, []);

  // Schedule the next poll without immediately fetching (used after a manual
  // refetch to avoid back-to-back requests).
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (
      !cancelledRef.current &&
      document.visibilityState === "visible"
    ) {
      timerRef.current = setTimeout(fetchOnce, POLL_MS);
    }
  }, [fetchOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchOnce();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (timerRef.current) clearTimeout(timerRef.current);
        fetchOnce();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelledRef.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchOnce]);

  return { pause, error, refetch: fetchOnce };
}
