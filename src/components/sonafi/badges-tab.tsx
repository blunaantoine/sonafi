"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Inbox, Info, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCard } from "./badge-card";
import { useSettings } from "@/components/sonafi/use-settings";
import { useCurrentDay } from "@/components/sonafi/use-current-day";
import {
  type Participant,
  TOTAL_PARTICIPANTS,
} from "@/lib/sonafi";

/**
 * Print stylesheet scoped to this tab.
 *
 * Badge sheet geometry — A4 portrait, full-bleed, exactly 20 badges/page:
 *   - 4 columns of 52.5mm (= 210mm / 4); the badge itself is cut at 50mm wide
 *     (the requested 5cm) and centered in its column → 2.5mm slack per column.
 *   - 5 rows of 59.4mm (= 297mm / 5). The requested 6cm (60mm) would need
 *     300mm — 3mm more than A4 — so the cut height is 59.4mm (invisible
 *     difference) to honor the "20 badges per page" requirement.
 *   - Dashed borders act as cut guides; `break-inside: avoid` keeps each badge
 *     whole; every 20 consecutive badges fill exactly one A4 page.
 * - Hides the app chrome (SubView header, toolbar, tab list) so the printed
 *   pages contain only badges.
 * - `print-color-adjust: exact` keeps the emerald branding on paper.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #ffffff !important; }

  /* Hide page chrome rendered by the parents (header, footer, tab list) */
  body > div > header,
  body > div > footer,
  header,
  footer,
  [role="tablist"],
  .sonafi-no-print {
    display: none !important;
  }

  /* Neutralize the mobile-first wrappers (max-w-md SubView/dashboard roots)
     so the badge grid can span the full 210mm page width. */
  main,
  [role="tabpanel"] {
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
    width: 100% !important;
  }
  div[class*="max-w-md"] {
    max-width: none !important;
    width: auto !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Exact sheet geometry: 4 × 52.5mm columns × 5 × 59.4mm rows = 20/page */
  .sonafi-badges-grid {
    display: grid !important;
    grid-template-columns: repeat(4, 52.5mm) !important;
    grid-auto-rows: 59.4mm !important;
    gap: 0 !important;
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .sonafi-badge {
    width: 50mm !important;
    height: 59.4mm !important;
    justify-self: center !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-shadow: none !important;
    /* Dashed border acts as the cut guide */
    border: 1px dashed #64748b !important;
    border-radius: 0 !important;
  }
  .sonafi-badge * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Typography tuned for the 50 × 59.4mm badge */
  .sonafi-badge-head {
    padding: 1.4mm 1.5mm 1.1mm !important;
  }
  .sonafi-badge-title {
    font-size: 8.5pt !important;
    letter-spacing: 0.16em !important;
  }
  .sonafi-badge-subtitle {
    font-size: 5.5pt !important;
  }
  .sonafi-qr-svg {
    width: 29mm !important;
    height: 29mm !important;
  }
  .sonafi-badge-id {
    font-size: 10.5pt !important;
  }
  .sonafi-badge-name {
    font-size: 6.5pt !important;
    line-height: 1.25 !important;
    max-width: 46mm !important;
  }
  .sonafi-badge-foot {
    font-size: 6pt !important;
    padding: 1.1mm !important;
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

  // Admin-configured participant count (dynamic — the admin can change the
  // total at runtime). Used as the range upper bound.
  const { totalParticipants: configuredTotal } = useSettings();
  const total = configuredTotal ?? participants?.length ?? TOTAL_PARTICIPANTS;

  // Admin-configured number of event days — printed in each badge footer.
  const { numberOfDays } = useCurrentDay();

  // Raw range values — kept as strings so the user can clear & retype freely.
  // The derived `from`/`to` numbers are clamped for slicing only.
  const [fromRaw, setFromRaw] = useState("1");
  const [toRaw, setToRaw] = useState(String(total));

  // Keep the default `to` in sync if the configured total changes before the
  // user touches it.
  useEffect(() => {
    if (configuredTotal && configuredTotal !== TOTAL_PARTICIPANTS) {
      setToRaw((cur) => (cur === String(TOTAL_PARTICIPANTS) ? String(configuredTotal) : cur));
    }
  }, [configuredTotal]);

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

  const fromNum = parseInt(fromRaw, 10);
  const toNum = parseInt(toRaw, 10);
  const from = Number.isNaN(fromNum)
    ? 1
    : clamp(fromNum, 1, total);
  const to = Number.isNaN(toNum)
    ? total
    : clamp(toNum, 1, total);

  // Build the visible slice from the ACTUAL participant list (which has random,
  // non-sequential ids). The range is now positional (#1..#N), not id-based —
  // so we never generate placeholder sequential ids like ID0042.
  const visible = useMemo<Participant[]>(() => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const list = (participants ?? []).slice(lo - 1, hi);
    return list;
  }, [participants, from, to]);

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
                max={total}
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
                max={total}
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
              Le QR contient un code secret unique par participante.
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
            <BadgeCard key={p.id} participant={p} days={numberOfDays} />
          ))}
        </div>
      )}
    </div>
  );
}

export default BadgesTab;
