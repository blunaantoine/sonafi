"use client";

import { useCallback, useEffect, useState } from "react";

interface SettingsResponse {
  totalParticipants: number;
  actual: number;
}

/**
 * Fetches the admin-configured participant count. Polls lightly so every admin
 * tab reflects a change made elsewhere. Exposes `refetch` for an immediate
 * refresh after the admin updates the count.
 */
export function useSettings() {
  const [totalParticipants, setTotalParticipants] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/sonafi/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setTotalParticipants(data.totalParticipants);
      setActual(data.actual);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 8_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { totalParticipants, actual, loading, refetch };
}
