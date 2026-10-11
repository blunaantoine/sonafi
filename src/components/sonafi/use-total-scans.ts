"use client";

import { useEffect, useRef, useState } from "react";
import type { StatsResponse } from "@/lib/sonafi";

/**
 * Polls the global scan counter while the given `active` flag is true.
 * Used by the page header badge so all tabs share the same live number.
 * Stops polling when inactive to save requests.
 */
export function useTotalScans(active = true) {
  const [totalScans, setTotalScans] = useState<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/sonafi/stats?recent=0");
        if (!res.ok) return;
        const data = (await res.json()) as StatsResponse;
        if (!cancelled) setTotalScans(data.totalScans);
      } catch {
        /* ignore transient network errors */
      } finally {
        if (!cancelled && activeRef.current) {
          timer = setTimeout(tick, 4000);
        }
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { totalScans: totalScans ?? 0 };
}
