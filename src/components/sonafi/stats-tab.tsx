"use client";

/**
 * StatsTab — live dashboard for the Sommet Sonafi pause management system.
 *
 * Polls GET /api/sonafi/stats?recent=20 every 5 s while the tab is visible,
 * pauses polling when the document is hidden, and shows:
 *   • 3 KPI cards (total passages, participantes inscrites, taux de service)
 *   • Passages par type de pause (custom Tailwind horizontal bars)
 *   • Passages par jour (3 rows, emerald shades)
 *   • Activité récente (scrollable feed of the latest ~20 scans)
 *
 * All labels are French. Colours come from PAUSE_META (amber / orange)
 * plus emerald/teal for the global accents — never indigo or blue.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity as ActivityIcon,
  CalendarDays,
  Coffee,
  Gauge,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  DAYS,
  DAY_LABELS,
  formatTimestamp,
  PAUSE_META,
  PAUSE_TYPES,
  TOTAL_PARTICIPANTS,
  type DayNumber,
  type PauseRecord,
  type PauseType,
  type StatsResponse,
} from "@/lib/sonafi";

// ---- constants --------------------------------------------------------------

const REFRESH_MS = 5_000;
const RECENT_LIMIT = 20;

/** Solid bar colour for each pause type (kept here so PAUSE_META stays generic). */
const PAUSE_BAR: Record<PauseType, string> = {
  cafe: "bg-amber-500",
  dejeuner: "bg-orange-500",
};

/** Solid dot colour for the activity-feed chip. */
const PAUSE_DOT: Record<PauseType, string> = {
  cafe: "bg-amber-500",
  dejeuner: "bg-orange-500",
};

/** Emerald shades for the 3 days (light → dark). */
const DAY_BAR: Record<DayNumber, string> = {
  1: "bg-emerald-400",
  2: "bg-emerald-500",
  3: "bg-emerald-600",
};

// ---- data hook --------------------------------------------------------------

interface StatsState {
  data: StatsResponse | null;
  loading: boolean; // first-load only
  error: string | null;
  lastUpdated: number | null;
  refetch: () => void;
}

function useStats(): StatsState {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/sonafi/stats?recent=${RECENT_LIMIT}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StatsResponse;
      setData(json);
      setLastUpdated(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every REFRESH_MS while visible; refresh on resume from hidden.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      await fetchStats();
      if (cancelled) return;
    };

    fetchStats();
    const id = setInterval(tick, REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchStats();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchStats]);

  return { data, loading, error, lastUpdated, refetch: fetchStats };
}

/** Re-render every second so the relative "Mis à jour il y a Xs" stays fresh. */
function useRelativeTime(ts: number | null): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (ts === null) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 2) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `il y a ${minutes}min`;
}

// ---- sub-components ---------------------------------------------------------

function KpiCard({
  label,
  value,
  icon,
  accentWrap,
  hint,
  children,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accentWrap: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-xs uppercase tracking-wide">
            {label}
          </CardDescription>
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              accentWrap,
            )}
          >
            {icon}
          </span>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={String(value)}
            initial={{ opacity: 0.4, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl"
          >
            {value}
          </motion.div>
        </AnimatePresence>
      </CardHeader>
      <CardContent>
        {children ??
          (hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null)}
      </CardContent>
    </Card>
  );
}

function PauseBreakdown({ counts }: { counts: Record<PauseType, number> }) {
  const max = Math.max(1, ...PAUSE_TYPES.map((t) => counts[t] ?? 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coffee className="h-4 w-4 text-emerald-600" />
          Passages par type de pause
        </CardTitle>
        <CardDescription>
          Répartition cumulée sur les 3 jours de l&apos;événement
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PAUSE_TYPES.map((type) => {
          const meta = PAUSE_META[type];
          const count = counts[type] ?? 0;
          const pct = Math.round((count / max) * 100);
          return (
            <div key={type} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden className="text-base leading-none">
                    {meta.emoji}
                  </span>
                  {meta.label}
                </span>
                <span className={cn("font-semibold tabular-nums", meta.accent)}>
                  {count}
                </span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={count}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={meta.label}
              >
                <motion.div
                  className={cn("h-full rounded-full", PAUSE_BAR[type])}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DayBreakdown({ byDay }: { byDay: Record<string, number> }) {
  const counts = DAYS.map((d) => byDay[String(d)] ?? 0);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-emerald-600" />
          Passages par jour
        </CardTitle>
        <CardDescription>
          {total} passage{total === 1 ? "" : "s"} sur les 3 jours
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {DAYS.map((day, i) => {
          const count = counts[i];
          const pct = Math.round((count / max) * 100);
          return (
            <div key={day} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold text-white",
                      DAY_BAR[day],
                    )}
                    aria-hidden
                  >
                    {day}
                  </span>
                  {DAY_LABELS[day]}
                </span>
                <span className="font-semibold tabular-nums text-emerald-700">
                  {count}
                </span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={count}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={DAY_LABELS[day]}
              >
                <motion.div
                  className={cn("h-full rounded-full", DAY_BAR[day])}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ActivityRow({ record }: { record: PauseRecord }) {
  const type = record.pauseType as PauseType;
  const day = record.day as DayNumber;
  const meta = PAUSE_META[type];
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
      <span
        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PAUSE_DOT[type])}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 truncate text-sm">
          <span className="font-mono text-xs text-muted-foreground">
            {record.participantId}
          </span>
          <span className="truncate font-medium">{record.participantName}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
            {DAY_LABELS[day]}
          </span>
          <span className={cn("rounded border px-1.5 py-0.5", meta.soft)}>
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>
      <time
        className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
        dateTime={record.timestamp}
      >
        {formatTimestamp(record.timestamp)}
      </time>
    </li>
  );
}

function ActivityFeed({ records }: { records: PauseRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon className="h-4 w-4 text-emerald-600" />
          Activité récente
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {records.length}
          </span>
        </CardTitle>
        <CardDescription>
          Les {RECENT_LIMIT} derniers passages enregistrés, du plus récent au
          plus ancien
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ActivityIcon className="h-5 w-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              Aucun passage enregistré pour le moment.
            </p>
          </div>
        ) : (
          <ul
            className="max-h-80 overflow-y-auto px-0 pb-2"
            style={{ scrollbarWidth: "thin" }}
          >
            {records.map((r) => (
              <ActivityRow key={r.id} record={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
              <Skeleton className="mt-2 h-9 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50/40">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
          <ActivityIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-red-900">
            Impossible de charger les statistiques
          </p>
          <p className="mt-0.5 text-xs text-red-700/80">{message}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
        >
          Réessayer
        </button>
      </CardContent>
    </Card>
  );
}

function LiveBadge({ lastUpdated }: { lastUpdated: number | null }) {
  const relative = useRelativeTime(lastUpdated);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span>
        {lastUpdated === null
          ? "En cours…"
          : `Mis à jour ${relative}`}
      </span>
    </div>
  );
}

// ---- main component ---------------------------------------------------------

export function StatsTab() {
  const { data, loading, error, lastUpdated, refetch } = useStats();

  if (loading && !data) return <StatsSkeleton />;

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />;
  }

  const totalScans = data?.totalScans ?? 0;
  const participantsCount = data?.totalParticipants ?? TOTAL_PARTICIPANTS;
  const byPauseType = data?.byPauseType ?? { cafe: 0, dejeuner: 0 };
  const byDay = data?.byDay ?? { "1": 0, "2": 0, "3": 0 };
  const recent = data?.recent ?? [];

  // 3 days × 2 pauses × current participant count.
  const potentialMax = participantsCount * 6;
  const tauxPct = Math.min(
    100,
    Math.round((totalScans / Math.max(potentialMax, 1)) * 1000) / 10,
  );

  return (
    <div className="space-y-4">
      {/* Live status line */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Tableau de bord en temps réel du Sommet Sonafi.
        </p>
        <LiveBadge lastUpdated={lastUpdated} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total passages"
          value={totalScans}
          hint="Scans cumulés sur les 3 jours"
          accentWrap="bg-emerald-100 text-emerald-700"
          icon={<ActivityIcon className="h-4 w-4" />}
        />
        <KpiCard
          label="Participantes inscrites"
          value={participantsCount}
          hint="Badges émis pour l'événement"
          accentWrap="bg-emerald-100 text-emerald-700"
          icon={<Users className="h-4 w-4" />}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardDescription className="text-xs uppercase tracking-wide">
                Taux de service potentiel
              </CardDescription>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Gauge className="h-4 w-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={String(tauxPct)}
                  initial={{ opacity: 0.4, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="text-3xl font-semibold tracking-tight tabular-nums text-emerald-700 sm:text-4xl"
                >
                  {tauxPct.toLocaleString("fr-FR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </motion.span>
              </AnimatePresence>
              <span className="text-lg font-medium text-emerald-700">%</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={tauxPct} className="h-2.5 bg-emerald-100 [&>div]:bg-emerald-500" />
            <p className="text-xs text-muted-foreground">
              {totalScans.toLocaleString("fr-FR")} / {potentialMax.toLocaleString("fr-FR")} passages potentiels
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PauseBreakdown counts={byPauseType} />
        <DayBreakdown byDay={byDay} />
      </div>

      {/* Recent activity */}
      <ActivityFeed records={recent} />

      {/* Subtle error banner if a refresh fails while we already have data */}
      {error && data ? (
        <p className="text-center text-xs text-amber-700">
          Rafraîchissement interrompu : {error}. Nouvelle tentative dans {Math.round(REFRESH_MS / 1000)}s.
        </p>
      ) : null}
    </div>
  );
}

export default StatsTab;
