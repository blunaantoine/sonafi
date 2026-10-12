"use client";

/**
 * ScanTab — phone-camera scanner used by the restauration team to validate
 * participant pauses. Matches the Sommet Sonafi mobile mockup (pages 3/4/5),
 * but with the event's orange (C.restauration) header colour instead of the
 * mockup's magenta.
 *
 * Layout
 * ┌──────────────────────────────────────┐
 * │ Orange header (rounded bottom 24px)  │
 * │   ◀ back           [Jour 1] pill    │
 * │   Restauration                       │
 * │   Scan des pauses                    │
 * ├──────────────────────────────────────┤
 * │  Pause en cours                       │
 * │  ┌ Pause indicator card ┐             │
 * │  │ Café · Auto · 8h-11h │             │
 * │  └────────────────────┘             │
 * │  ┌ Dark viewfinder card ┐            │
 * │  │ [camera + corner brackets]        │
 * │  │ Placez le badge…                 │
 * │  └────────────────────┘             │
 * │  ┌ Status card ┐                    │
 * │  │ En attente d'un badge            │
 * │  └────────────┘                    │
 * │  Cafés servis aujourd'hui   X / 500 │
 * └──────────────────────────────────────┘
 *
 * The pause type comes from `useEffectivePause` (auto by clock, or admin
 * override) — NOT a manual selector. The day is a manual selector (persisted
 * to localStorage).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import {
  DAY_LABELS,
  DAYS,
  PAUSE_META,
  PAUSE_WINDOWS,
  type DayNumber,
  type EffectivePause,
  type PauseType,
  type StatsResponse,
} from "@/lib/sonafi";
import { useEffectivePause } from "@/components/sonafi/use-effective-pause";
import { useRole } from "@/components/sonafi/use-role";
import { C, R } from "@/lib/design-tokens";
import {
  ScanResultOverlay,
  type ScanResult,
} from "@/components/sonafi/scan-result-overlay";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Element id into which html5-qrcode injects the <video> stream. */
const QR_READER_ID = "sonafi-restauration-qr-reader";

/** Ignore repeated decodes of the same code within this window (ms). */
const DEBOUNCE_MS = 2500;

/** How long the result overlay stays on screen after a result (ms). */
const OVERLAY_MS = 2200;

/** How often the per-day café count is refreshed (ms). */
const STATS_POLL_MS = 4000;

/** Fallback participant count for the stats line (X / 500). */
const DEFAULT_TOTAL = 500;

const LS_DAY = "sonafi.scan.day";

// ---------------------------------------------------------------------------
// localStorage helpers (sanitised — never trust what's in there)
// ---------------------------------------------------------------------------

function readDay(): DayNumber {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(LS_DAY);
    const n = raw == null ? NaN : Number(JSON.parse(raw));
    if (n === 1 || n === 2 || n === 3) return n;
  } catch {
    /* ignore */
  }
  return 1;
}

function writeLS(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy errors */
  }
}

// ---------------------------------------------------------------------------
// Friendly camera error translation
// ---------------------------------------------------------------------------

function friendlyCameraError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/NotAllowedError|PermissionDenied/i.test(msg)) {
    return "Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur, puis réessayez.";
  }
  if (/NotFoundError|DevicesNotFoundError|CameraNotFound/i.test(msg)) {
    return "Aucune caméra détectée sur cet appareil.";
  }
  if (/NotReadableError|TrackStartError|NotReadable/i.test(msg)) {
    return "La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.";
  }
  if (/InsecureContext|HTTPS|getUserMedia/i.test(msg)) {
    return "La caméra nécessite une connexion HTTPS sécurisée.";
  }
  return "Impossible d'activer la caméra. Vérifiez votre navigateur et réessayez.";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScanTab() {
  const { goHome } = useRole();

  // ----- Day selector (persisted) ------------------------------------------
  const [day, setDay] = useState<DayNumber>(readDay);
  useEffect(() => writeLS(LS_DAY, day), [day]);

  // ----- Effective pause: automatic by clock, or admin-forced (shared) ----
  const { pause: effective } = useEffectivePause();
  const pauseType: PauseType | null = effective?.pauseType ?? null;

  // Refs mirroring day/pause so the (once-created) scan callback always sees
  // the latest value even if the user switches mid-session.
  const dayRef = useRef(day);
  const pauseTypeRef = useRef<PauseType | null>(pauseType);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);
  useEffect(() => {
    pauseTypeRef.current = pauseType;
  }, [pauseType]);

  // ----- Camera state ------------------------------------------------------
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ----- Scan flow state ---------------------------------------------------
  const scanningRef = useRef(true);
  const lastScanRef = useRef<{ id: string; ts: number }>({ id: "", ts: 0 });
  const inFlightRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [overlay, setOverlay] = useState<ScanResult | null>(null);

  // ----- Per-day café count for the stats line ----------------------------
  const [cafeCount, setCafeCount] = useState(0);
  const [totalParticipants, setTotalParticipants] = useState(DEFAULT_TOTAL);
  const dayRefForStats = useRef(day);
  useEffect(() => {
    dayRefForStats.current = day;
  }, [day]);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/sonafi/stats?day=${dayRefForStats.current}&recent=0`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as StatsResponse;
      setCafeCount(data.dayDetail?.cafe ?? 0);
      setTotalParticipants(data.totalParticipants || DEFAULT_TOTAL);
    } catch {
      /* ignore transient network errors */
    }
  }, []);

  useEffect(() => {
    void refreshStats();
    const id = setInterval(refreshStats, STATS_POLL_MS);
    return () => clearInterval(id);
  }, [refreshStats, day]);

  // ----- Pause / resume the camera whenever the overlay toggles -----------
  useEffect(() => {
    const inst = html5Ref.current;
    if (!inst) return;
    try {
      if (overlay) inst.pause(true);
      else inst.resume();
    } catch {
      /* ignore */
    }
  }, [overlay]);

  // ----- recordPause: POST to the API, build overlay + recent entry -------
  const recordPause = useCallback(async (participantId: string) => {
    if (inFlightRef.current) return;
    const d = dayRef.current;
    const p = pauseTypeRef.current;
    if (!p) return; // pause type not known yet — ignore the scan
    inFlightRef.current = true;
    scanningRef.current = false;

    // Show loading overlay immediately so the user sees feedback.
    setOverlay({
      state: "loading",
      participantId,
      day: d,
      pauseType: p,
    });

    let result: ScanResult;

    try {
      const res = await fetch("/api/sonafi/pause/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, day: d, pauseType: p }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        participant?: { id: string; name: string };
        pause?: { timestamp: string };
      };

      if (res.ok && data?.success) {
        result = {
          state: "success",
          participantId: data.participant?.id ?? participantId,
          participantName: data.participant?.name,
          day: d,
          pauseType: p,
          timestamp: data.pause?.timestamp,
        };
        navigator.vibrate?.(120);
        // Refresh the per-day café count right away.
        void refreshStats();
      } else if (res.status === 409) {
        result = {
          state: "duplicate",
          participantId: data.participant?.id ?? participantId,
          participantName: data.participant?.name,
          day: d,
          pauseType: p,
        };
        navigator.vibrate?.([60, 60, 60]);
      } else if (res.status === 404) {
        result = {
          state: "unknown",
          participantId,
          day: d,
          pauseType: p,
        };
        navigator.vibrate?.([60, 60, 60]);
      } else {
        result = { state: "error", participantId, day: d, pauseType: p };
      }
    } catch {
      result = { state: "error", participantId, day: d, pauseType: p };
    }

    // Show the final result.
    setOverlay(result);

    // Dismiss the overlay and resume scanning after OVERLAY_MS.
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setOverlay(null);
      scanningRef.current = true;
      inFlightRef.current = false;
    }, OVERLAY_MS);
  }, [refreshStats]);

  // ----- handleScan: the callback passed to html5-qrcode ------------------
  const handleScan = useCallback(
    (decoded: string) => {
      if (!scanningRef.current) return;
      if (inFlightRef.current) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last.id === decoded && now - last.ts < DEBOUNCE_MS) return;
      lastScanRef.current = { id: decoded, ts: now };
      void recordPause(decoded);
    },
    [recordPause],
  );

  // ----- startCamera: dynamic-import html5-qrcode, prefer back camera -----
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      // Tear down any previous instance before starting again.
      if (html5Ref.current) {
        try {
          if (html5Ref.current.isScanning) await html5Ref.current.stop();
        } catch {
          /* ignore */
        }
        try {
          html5Ref.current.clear();
        } catch {
          /* ignore */
        }
        html5Ref.current = null;
      }

      const instance = new Html5Qrcode(QR_READER_ID, {
        verbose: false,
      });
      html5Ref.current = instance;

      const config = {
        fps: 10,
        qrbox: (vw: number, vh: number) => {
          const minEdge = Math.min(vw, vh);
          const size = Math.max(160, Math.floor(minEdge * 0.7));
          return { width: size, height: size };
        },
      };

      const startConfig = { facingMode: { ideal: "environment" as const } };

      await instance.start(startConfig, config, handleScan, () => {
        /* per-frame decode errors are noisy — ignore */
      });

      setCameraReady(true);
    } catch (err) {
      setCameraError(friendlyCameraError(err));
      setCameraReady(false);
    }
  }, [handleScan]);

  // ----- mount: auto-start camera; unmount: stop + clear -------------------
  useEffect(() => {
    void startCamera();
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      const inst = html5Ref.current;
      html5Ref.current = null;
      scanningRef.current = false;
      inFlightRef.current = false;
      void (async () => {
        if (!inst) return;
        try {
          if (inst.isScanning) await inst.stop();
        } catch {
          /* ignore */
        }
        try {
          inst.clear();
        } catch {
          /* ignore */
        }
      })();
    };
    // We deliberately start only once on mount — startCamera is captured at
    // first render, which is exactly what we want (initial camera).
  }, []);

  // ----- dismissOverlay: called when the user taps "Scanner le suivant" ----
  const dismissOverlay = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setOverlay(null);
    scanningRef.current = true;
    inFlightRef.current = false;
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col">
      {/* ===== Orange header (rounded bottom corners) ===== */}
      <header
        className="rounded-b-3xl px-5 pb-6 pt-5 text-white shadow-sm"
        style={{
          backgroundColor: C.restauration,
          borderBottomLeftRadius: R.headerBottom,
          borderBottomRightRadius: R.headerBottom,
        }}
      >
        <div className="flex items-center justify-between">
          {/* Back button — translucent-white circle */}
          <button
            type="button"
            onClick={goHome}
            aria-label="Retour à l'accueil"
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
            style={{ backgroundColor: C.headerTint }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Day pill — translucent-white bg, white text */}
          <span
            className="inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: C.headerTint }}
          >
            {DAY_LABELS[day]}
          </span>
        </div>

        <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-tight">
          Restauration
        </h1>
        <p className="mt-0.5 text-base font-normal text-white/90">
          Scan des pauses
        </p>
      </header>

      {/* ===== Body (20px padding) ===== */}
      <div className="flex flex-col gap-4 p-5">
        {/* Compact day selector — 3 pills */}
        <section aria-label="Choix du jour">
          <div className="grid grid-cols-3 gap-2">
            {DAYS.map((d) => {
              const active = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  aria-pressed={active}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2",
                    active
                      ? "text-white shadow-sm"
                      : "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50",
                  )}
                  style={
                    active
                      ? { backgroundColor: C.restauration }
                      : undefined
                  }
                >
                  {DAY_LABELS[d]}
                </button>
              );
            })}
          </div>
        </section>

        {/* Pause en cours — label + indicator card */}
        <section aria-label="Pause en cours">
          <h2
            className="mb-2 text-[15px] font-medium"
            style={{ color: C.textSecondary }}
          >
            Pause en cours
          </h2>
          <PauseIndicatorCard pause={effective} />
        </section>

        {/* Camera viewfinder card */}
        <section aria-label="Caméra de scan">
          <ViewfinderCard
            cameraReady={cameraReady}
            cameraError={cameraError}
            onRetry={() => void startCamera()}
          />
        </section>

        {/* Status card */}
        <StatusCard pauseType={pauseType} overlay={overlay} />

        {/* Stats line */}
        <StatsLine
          cafeCount={cafeCount}
          totalParticipants={totalParticipants}
        />
      </div>

      {/* ===== Full-screen result overlay (pages 4/5) ===== */}
      <ScanResultOverlay result={overlay} onScanNext={dismissOverlay} />
    </div>
  );
}

export default ScanTab;

// ---------------------------------------------------------------------------
// PauseIndicatorCard — shows the current effective pause + time window
// ---------------------------------------------------------------------------

function PauseIndicatorCard({ pause }: { pause: EffectivePause | null }) {
  if (!pause) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
        style={{ color: C.textSecondary }}
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Chargement de la pause en cours…</span>
      </div>
    );
  }

  const meta = PAUSE_META[pause.pauseType];
  const isOverride = pause.source === "override";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
      style={{ color: C.textPrimary }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
        style={{ backgroundColor: C.restaurationTint }}
        aria-hidden
      >
        {meta.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold">{meta.label}</span>
          {isOverride ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: C.warning }}
            >
              <ShieldAlert className="h-3 w-3" />
              Forcée
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: C.success }}
            >
              <Clock className="h-3 w-3" />
              Auto
            </span>
          )}
        </div>
        <p
          className="mt-0.5 text-xs"
          style={{ color: C.textSecondary }}
        >
          {isOverride
            ? "Forcée par l'admin — utilisée par tous les scanners."
            : PAUSE_WINDOWS[pause.pauseType]}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViewfinderCard — dark camera viewport with corner brackets + retry button
// ---------------------------------------------------------------------------

interface ViewfinderCardProps {
  cameraReady: boolean;
  cameraError: string | null;
  onRetry: () => void;
}

function ViewfinderCard({
  cameraReady,
  cameraError,
  onRetry,
}: ViewfinderCardProps) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        backgroundColor: C.viewfinder,
        borderRadius: 20,
        aspectRatio: "1 / 1",
      }}
    >
      {/* html5-qrcode injects the <video> here */}
      <div
        id={QR_READER_ID}
        className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
      />

      {/* 4 white L-shaped corner brackets (the viewfinder reticle) */}
      {cameraReady && !cameraError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[64%] w-[64%]">
            <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-l-4 border-t-4 border-white" />
            <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-r-4 border-t-4 border-white" />
            <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-b-4 border-l-4 border-white" />
            <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-b-4 border-r-4 border-white" />
            <motion.span
              className="absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-white/80 shadow-[0_0_8px_2px_rgba(255,255,255,0.55)]"
              animate={{ y: [-90, 90, -90] }}
              transition={{
                duration: 2.6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
        </div>
      )}

      {/* Instruction text — shown when no result + camera ready */}
      {cameraReady && !cameraError && (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-base font-medium text-white/80">
          Placez le badge devant la caméra
        </p>
      )}

      {/* Initialising spinner */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/85">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Activation de la caméra…</p>
        </div>
      )}

      {/* Camera error card */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
          <AlertTriangle className="h-10 w-10" style={{ color: C.warningSoft }} />
          <p className="max-w-xs text-sm leading-relaxed text-white/90">
            {cameraError}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-transform active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusCard — light-orange icon square + waiting-state text
// ---------------------------------------------------------------------------

function StatusCard({
  pauseType,
  overlay,
}: {
  pauseType: PauseType | null;
  overlay: ScanResult | null;
}) {
  let title = "En attente d'un badge";
  let subtitle = "Le résultat s'affiche en vert ou en rouge";

  if (overlay?.state === "loading") {
    title = "Vérification en cours…";
    subtitle = pauseType
      ? `Pause ${PAUSE_META[pauseType].label.toLowerCase()}`
      : "Pause…";
  } else if (overlay?.state === "success") {
    title = "Pause validée";
    subtitle = "Vous pouvez scanner le suivant";
  } else if (overlay?.state === "duplicate") {
    title = "Déjà pris aujourd'hui";
    subtitle = "Ne pas servir";
  } else if (overlay?.state === "unknown") {
    title = "Badge non reconnu";
    subtitle = "Vérifiez le badge et réessayez";
  } else if (overlay?.state === "error") {
    title = "Erreur de connexion";
    subtitle = "Réessayez dans un instant";
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
      style={{ borderRadius: R.card }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: C.restaurationTint }}
        aria-hidden
      >
        <ScanLine className="h-6 w-6" style={{ color: C.restauration }} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-base font-semibold leading-tight"
          style={{ color: C.textPrimary }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 text-sm"
          style={{ color: C.textSecondary }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatsLine — "Cafés servis aujourd'hui   X / 500"
// ---------------------------------------------------------------------------

function StatsLine({
  cafeCount,
  totalParticipants,
}: {
  cafeCount: number;
  totalParticipants: number;
}) {
  const pct = Math.min(
    100,
    totalParticipants > 0
      ? Math.round((cafeCount / totalParticipants) * 100)
      : 0,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span
          className="text-sm font-medium"
          style={{ color: C.textSecondary }}
        >
          Cafés servis aujourd'hui
        </span>
        <span
          className="text-base font-bold tabular-nums"
          style={{ color: C.textPrimary }}
        >
          {cafeCount} / {totalParticipants}
        </span>
      </div>
      {/* Progress bar — orange fill on a neutral track */}
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: C.track }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalParticipants}
        aria-valuenow={cafeCount}
        aria-label="Cafés servis aujourd'hui"
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: C.restauration }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
