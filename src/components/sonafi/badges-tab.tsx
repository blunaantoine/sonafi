"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Inbox, Info, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCard } from "./badge-card";
import {
  type Participant,
  TOTAL_PARTICIPANTS,
  formatParticipantId,
} from "@/lib/sonafi";

/**
 * Print stylesheet scoped to this tab.
 *
 * - Hides the page header, footer and the shadcn TabsList (rendered by the
 *   parent route) so the printed page only contains the badges.
 * - Lays badges out as a 2×4 grid on A4 portrait (≈8 badges per page) with
 *   dashed cut guides around each badge and `break-inside: avoid` so badges
 *   never split across pages.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  html, body { background: #ffffff !important; }

  /* Hide page chrome rendered by the parent (header, footer, tab list) */
  body > div > header,
  body > div > footer,
  header,
  footer,
  [role="tablist"] {
    display: none !important;
  }

  /* Reset the layout wrappers so badges start at the top of the page */
  main,
  [role="tabpanel"] {
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
    width: 100% !important;
  }

  /* Hide everything in this component marked as no-print (toolbar, etc.) */
  .sonafi-no-print { display: none !important; }

  /* 2 columns × 4 rows = 8 badges per A4 page */
  .sonafi-badges-grid {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 3mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .sonafi-badge {
    break-inside: avoid;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-shadow: none !important;
    /* Dashed border acts as the cut guide */
    border: 1px dashed #94a3b8 !important;
    border-radius: 2mm !important;
  }

  .sonafi-qr-svg {
    width: 28mm !important;
    height: 28mm !important;
  }
}
`;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

interface ParticipantsResponse {
  total?: number;
  participants?: Participant[];
}

export function BadgesTab() {
  // null = loading, Participant[] = loaded (may be empty), error message handled separately
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Raw range values — kept as strings so the user can clear & retype freely.
  // The derived `from`/`to` numbers are clamped for slicing only.
  const [fromRaw, setFromRaw] = useState("1");
  const [toRaw, setToRaw] = useState(String(TOTAL_PARTICIPANTS));

  // Fetch the full participant list once on mount (limit=0 = all 500).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sonafi/participants?limit=0");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ParticipantsResponse;
        if (cancelled) return;
        setParticipants(data.participants ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erreur inconnue");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Map id -> participant for O(1) lookups when slicing the visible range.
  const byId = useMemo(() => {
    const m = new Map<string, Participant>();
    for (const p of participants ?? []) m.set(p.id, p);
    return m;
  }, [participants]);

  const fromNum = parseInt(fromRaw, 10);
  const toNum = parseInt(toRaw, 10);
  const from = Number.isNaN(fromNum)
    ? 1
    : clamp(fromNum, 1, TOTAL_PARTICIPANTS);
  const to = Number.isNaN(toNum)
    ? TOTAL_PARTICIPANTS
    : clamp(toNum, 1, TOTAL_PARTICIPANTS);

  // Build the visible slice client-side. Falls back to "Participant IDxxxx"
  // when the API hasn't returned a real name for that id yet.
  const visible = useMemo<Participant[]>(() => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const list: Participant[] = [];
    for (let i = lo; i <= hi; i++) {
      const id = formatParticipantId(i);
      const found = byId.get(id);
      list.push(found ?? { id, name: `Participant ${id}` });
    }
    return list;
  }, [byId, from, to]);

  const loading = participants === null && error === null;

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar */}
      <Card className="sonafi-no-print p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Range controls */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="badge-from"
                className="text-xs font-medium text-muted-foreground"
              >
                De
              </label>
              <Input
                id="badge-from"
                type="number"
                min={1}
                max={TOTAL_PARTICIPANTS}
                value={fromRaw}
                onChange={(e) => setFromRaw(e.target.value)}
                className="w-20"
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="badge-to"
                className="text-xs font-medium text-muted-foreground"
              >
                à
              </label>
              <Input
                id="badge-to"
                type="number"
                min={1}
                max={TOTAL_PARTICIPANTS}
                value={toRaw}
                onChange={(e) => setToRaw(e.target.value)}
                className="w-20"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Count + QR note */}
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {loading ? (
                "Chargement des participantes…"
              ) : (
                <>
                  <span className="font-semibold text-emerald-700">
                    {visible.length}
                  </span>{" "}
                  badge{visible.length > 1 ? "s" : ""} affiché
                  {visible.length > 1 ? "s" : ""}
                </>
              )}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              Le contenu du QR est l&apos;identifiant (ex: ID0042).
            </span>
          </div>

          {/* Print */}
          <Button
            type="button"
            onClick={() => window.print()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </Button>
        </div>
      </Card>

      {/* Content */}
      {error ? (
        <Card className="p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="space-y-1">
              <p className="font-semibold">
                Impossible de charger les participantes
              </p>
              <p className="text-sm text-muted-foreground">
                {error}. Vérifiez votre connexion puis rechargez la page.
              </p>
            </div>
          </div>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="p-8">
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-50" />
            <p>Aucune participante à afficher dans cette plage.</p>
          </div>
        </Card>
      ) : (
        <div className="sonafi-badges-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((p) => (
            <BadgeCard key={p.id} participant={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default BadgesTab;
