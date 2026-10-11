"use client";

import * as React from "react";

import type { Participant } from "@/lib/sonafi";
import { ParticipantsImportCard } from "./participants-import-card";
import { ParticipantsList } from "./participants-list";

/**
 * ParticipantsTab — orchestrates the import card + the searchable list.
 *
 * Fetches all 500 participants on mount, filters client-side, and refetches
 * after any successful import or single edit (so the parent page can stay
 * stateless w.r.t. participants).
 */
export function ParticipantsTab() {
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sonafi/participants?limit=0", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(
          `Impossible de charger les participantes (HTTP ${res.status}).`,
        );
      }
      const data = (await res.json()) as {
        total: number;
        participants: Participant[];
      };
      setParticipants(Array.isArray(data.participants) ? data.participants : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <ParticipantsImportCard onImported={refresh} />
      <ParticipantsList
        participants={participants}
        loading={loading}
        error={error}
        onRefresh={refresh}
        onEdited={refresh}
      />
    </div>
  );
}

export default ParticipantsTab;
