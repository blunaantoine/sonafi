"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DayNumber } from "@/lib/sonafi";

const POLL_MS = 4_000;

interface DayResponse {
  day: DayNumber;
  dates?: Record<string, string>;
  forced?: boolean;
}

/**
 * Polls /api/sonafi/day so every scanner phone and the verification team pick
 * up the admin-programmed current day within a few seconds. Pauses polling
 * when the tab is hidden, and re-fetches immediately when it becomes visible.
 *
 * The admin sets the day + dates from the dashboard (PUT /api/sonafi/day);
 * everyone else just reads it here. The current day auto-derives from the
 * configured dates, unless the admin forces a day (the "retard" override).
 */
export function useCurrentDay() {
  const [day, setDay] = useState<DayNumber>(1);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [forced, setForced] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/sonafi/day", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as DayResponse;
      if (!cancelledRef.current && (data.day === 1 || data.day === 2 || data.day === 3)) {
        setDay(data.day);
        setDates(data.dates ?? {});
        setForced(data.forced ?? false);
      }
    } catch {
      /* ignore */
    } finally {
      if (
        !cancelledRef.current &&
        document.visibilityState === "visible"
      ) {
        timerRef.current = setTimeout(fetchOnce, POLL_MS);
      }
    }
  }, []);

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

  return { day, dates, forced, refetch: fetchOnce };
}
