"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanLine,
  WifiOff,
  X,
} from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DAY_LABELS,
  DAYS,
  PAUSE_META,
  PAUSE_TYPES,
  formatTimestamp,
  type DayNumber,
  type PauseType,
} from "@/lib/sonafi";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Element id into which html5-qrcode injects the <video> stream. */
const QR_READER_ID = "sonafi-qr-reader";

/** Ignore repeated decodes of the same code within this window (ms). */
const DEBOUNCE_MS = 2500;

/** How long the result overlay stays on screen after a result (ms). */
const OVERLAY_MS = 2200;

/** Keep at most this many recent scans in the session list. */
const MAX_RECENT = 12;

const LS_DAY = "sonafi.scan.day";
const LS_PAUSE = "sonafi.scan.pauseType";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultState = "loading" | "success" | "duplicate" | "unknown" | "error";
type ScanStatus = "validated" | "duplicate" | "unknown" | "error";

interface OverlayState {
  state: ResultState;
  participantId: string;
  participantName?: string;
  day: DayNumber;
  pauseType: PauseType;
  timestamp?: string;
}

interface ScanEntry {
  id: string;
  participantId: string;
  participantName?: string;
  day: DayNumber;
  pauseType: PauseType;
  timestamp: string;
  status: ScanStatus;
}

interface OverlayTheme {
  bg: string;
  icon: ReactNode;
  headline: string;
  sub?: string;
  meta?: string;
}

// Solid dot colour per pause type — brighter than PAUSE_META.soft for visibility.
const PAUSE_DOT: Record<PauseType, string> = {
  cafe: "bg-amber-500",
  dejeuner: "bg-orange-500",
  jeux: "bg-fuchsia-500",
};

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

function readPause(): PauseType {
  if (typeof window === "undefined") return "cafe";
  try {
    const raw = window.localStorage.getItem(LS_PAUSE);
    if (raw == null) return "cafe";
    const v = JSON.parse(raw) as string;
    if (v === "cafe" || v === "dejeuner" || v === "jeux") return v;
  } catch {
    /* ignore */
  }
  return "cafe";
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
  // ----- Persistent selectors ---------------------------------------------
  const [day, setDay] = useState<DayNumber>(readDay);
  const [pauseType, setPauseType] = useState<PauseType>(readPause);

  useEffect(() => writeLS(LS_DAY, day), [day]);
  useEffect(() => writeLS(LS_PAUSE, pauseType), [pauseType]);

  // Refs mirroring day/pause so the (once-created) scan callback always sees
  // the latest value even if the user switches mid-session.
  const dayRef = useRef(day);
  const pauseTypeRef = useRef(pauseType);
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
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraIdx, setCameraIdx] = useState(0);

  // ----- Scan flow state ---------------------------------------------------
  const scanningRef = useRef(true);
  const lastScanRef = useRef<{ id: string; ts: number }>({ id: "", ts: 0 });
  const inFlightRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [recent, setRecent] = useState<ScanEntry[]>([]);
  const [sessionCount, setSessionCount] = useState(0);

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
    inFlightRef.current = true;
    scanningRef.current = false;

    const d = dayRef.current;
    const p = pauseTypeRef.current;

    // Show loading overlay immediately so the user sees feedback.
    setOverlay({
      state: "loading",
      participantId,
      day: d,
      pauseType: p,
    });

    let result: OverlayState;
    let status: ScanStatus;

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
        status = "validated";
        navigator.vibrate?.(120);
      } else if (res.status === 409) {
        result = {
          state: "duplicate",
          participantId: data.participant?.id ?? participantId,
          participantName: data.participant?.name,
          day: d,
          pauseType: p,
        };
        status = "duplicate";
        navigator.vibrate?.([60, 60, 60]);
      } else if (res.status === 404) {
        result = {
          state: "unknown",
          participantId,
          day: d,
          pauseType: p,
        };
        status = "unknown";
        navigator.vibrate?.([60, 60, 60]);
      } else {
        result = { state: "error", participantId, day: d, pauseType: p };
        status = "error";
      }
    } catch {
      result = { state: "error", participantId, day: d, pauseType: p };
      status = "error";
    }

    // Show the final result.
    setOverlay(result);

    // Push a recent-scans entry.
    setRecent((prev) =>
      [
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          participantId: result.participantId,
          participantName: result.participantName,
          day: d,
          pauseType: p,
          timestamp: result.timestamp ?? new Date().toISOString(),
          status,
        } as ScanEntry,
        ...prev,
      ].slice(0, MAX_RECENT),
    );
    setSessionCount((c) => c + 1);

    // Dismiss the overlay and resume scanning after OVERLAY_MS.
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setOverlay(null);
      scanningRef.current = true;
      inFlightRef.current = false;
    }, OVERLAY_MS);
  }, []);

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
  const startCamera = useCallback(
    async (preferredIdx?: number) => {
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

        // Enumerate cameras (best-effort — falls back to facingMode).
        let cams: { id: string; label: string }[] = [];
        try {
          cams = await Html5Qrcode.getCameras();
          if (cams.length > 0) setCameras(cams);
        } catch {
          /* ignore — will use facingMode */
        }

        const idx =
          preferredIdx != null ? preferredIdx : Math.min(cameraIdx, cams.length);
        const chosen = cams[idx];

        const config = {
          fps: 10,
          qrbox: (vw: number, vh: number) => {
            const minEdge = Math.min(vw, vh);
            const size = Math.max(160, Math.floor(minEdge * 0.7));
            return { width: size, height: size };
          },
        };

        const startConfig = chosen
          ? { deviceId: { exact: chosen.id } }
          : { facingMode: { ideal: "environment" as const } };

        await instance.start(startConfig, config, handleScan, () => {
          /* per-frame decode errors are noisy — ignore */
        });

        setCameraReady(true);
      } catch (err) {
        setCameraError(friendlyCameraError(err));
        setCameraReady(false);
      }
    },
    [cameraIdx, handleScan],
  );

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

  // ----- cycleCamera: switch to next available camera ---------------------
  const cycleCamera = useCallback(async () => {
    if (cameras.length < 2) return;
    const next = (cameraIdx + 1) % cameras.length;
    setCameraIdx(next);
    await startCamera(next);
  }, [cameras.length, cameraIdx, startCamera]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-5">
      {/* Day selector */}
      <section aria-label="Choix du jour">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Jour</h2>
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
                  "flex h-12 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2",
                  active
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                    : "border-border bg-background text-foreground hover:bg-emerald-50",
                )}
              >
                {DAY_LABELS[d]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Pause selector */}
      <section aria-label="Choix de la pause">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Pause</h2>
        <div className="grid grid-cols-3 gap-2">
          {PAUSE_TYPES.map((p) => {
            const meta = PAUSE_META[p];
            const active = p === pauseType;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPauseType(p)}
                aria-pressed={active}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  active
                    ? cn(meta.soft, "ring-2", meta.ring, "focus-visible:ring-emerald-400")
                    : "border-border bg-background text-foreground hover:bg-accent focus-visible:ring-emerald-400",
                )}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {meta.emoji}
                </span>
                <span className="leading-tight">
                  {meta.label.replace(/^Pause\s+/, "")}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Camera */}
      <section aria-label="Caméra de scan">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Caméra</h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ScanLine className="h-3.5 w-3.5" />
            {sessionCount} scan{sessionCount === 1 ? "" : "s"} cette session
          </span>
        </div>

        <Card className="overflow-hidden border-emerald-100 py-0">
          <CardContent className="p-3 sm:p-4">
            <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl border border-border bg-slate-900">
              {/* html5-qrcode injects the <video> here */}
              <div
                id={QR_READER_ID}
                className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover [&>video]:bg-slate-900"
              />

              {/* Scan reticle overlay */}
              {cameraReady && !cameraError && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-[62%] w-[62%]">
                    <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-white/90" />
                    <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-white/90" />
                    <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-white/90" />
                    <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-white/90" />
                    <motion.span
                      className="absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(16,185,129,0.65)]"
                      animate={{ y: [-90, 90, -90] }}
                      transition={{
                        duration: 2.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Initialising spinner */}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Activation de la caméra…</p>
                </div>
              )}

              {/* Camera error card */}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/95 p-6 text-center text-white">
                  <AlertTriangle className="h-10 w-10 text-rose-300" />
                  <p className="max-w-xs text-sm leading-relaxed text-white/90">
                    {cameraError}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void startCamera()}
                    className="bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Réessayer
                  </Button>
                </div>
              )}

              {/* Camera switch */}
              {cameraReady && cameras.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void cycleCamera()}
                  className="absolute right-2 top-2 z-10 h-8 gap-1 bg-black/55 text-white backdrop-blur hover:bg-black/70"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Caméra
                </Button>
              )}
            </div>

            {/* Status row */}
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    cameraReady
                      ? "animate-pulse bg-emerald-500"
                      : "bg-muted-foreground/40",
                  )}
                />
                {cameraReady
                  ? "Caméra active"
                  : cameraError
                    ? "Caméra indisponible"
                    : "Démarrage…"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {PAUSE_META[pauseType].emoji} {PAUSE_META[pauseType].label} ·{" "}
                {DAY_LABELS[day]}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Recent scans */}
      <section aria-label="Scans récents">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Scans récents
          </h2>
          <span className="text-xs text-muted-foreground">
            {recent.length}/{MAX_RECENT}
          </span>
        </div>

        {recent.length === 0 ? (
          <Card className="border-dashed bg-muted/30 py-0">
            <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Aucun scan pour le moment
            </CardContent>
          </Card>
        ) : (
          <div
            className="max-h-72 overflow-y-auto pr-1
              [&::-webkit-scrollbar]:w-2
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30
              [&::-webkit-scrollbar-track]:bg-transparent"
          >
            <ul className="flex flex-col gap-2">
              {recent.map((e) => (
                <li key={e.id}>
                  <Card className="border-border/70 py-0">
                    <CardContent className="flex items-center gap-3 px-3 py-2.5">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          PAUSE_DOT[e.pauseType],
                        )}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-semibold">
                            {e.participantName ?? "Badge non reconnu"}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {e.participantId}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {DAY_LABELS[e.day]} · {PAUSE_META[e.pauseType].label} ·{" "}
                          {formatTimestamp(e.timestamp)}
                        </div>
                      </div>
                      <StatusPill status={e.status} />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Full-screen result overlay */}
      <ResultOverlay overlay={overlay} />
    </div>
  );
}

export default ScanTab;

// ---------------------------------------------------------------------------
// StatusPill — small coloured pill for the recent-scans list
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: ScanStatus }) {
  const map: Record<ScanStatus, { label: string; className: string }> = {
    validated: {
      label: "Validé",
      className: "border-emerald-200 bg-emerald-100 text-emerald-800",
    },
    duplicate: {
      label: "Doublon",
      className: "border-rose-200 bg-rose-100 text-rose-800",
    },
    unknown: {
      label: "Inconnu",
      className: "border-amber-200 bg-amber-100 text-amber-800",
    },
    error: {
      label: "Erreur",
      className: "border-slate-200 bg-slate-100 text-slate-700",
    },
  };
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        m.className,
      )}
    >
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ResultOverlay — full-screen verdict shown after each scan
// ---------------------------------------------------------------------------

function ResultOverlay({ overlay }: { overlay: OverlayState | null }) {
  const theme: OverlayTheme | null = (() => {
    if (!overlay) return null;
    const meta = `${PAUSE_META[overlay.pauseType].emoji} ${PAUSE_META[overlay.pauseType].label} · ${DAY_LABELS[overlay.day]}`;
    switch (overlay.state) {
      case "loading":
        return {
          bg: "bg-slate-900/95",
          icon: <Loader2 className="h-16 w-16 animate-spin text-white" />,
          headline: "Vérification…",
          sub: overlay.participantId,
        };
      case "success":
        return {
          bg: "bg-emerald-600",
          icon: <Check className="h-20 w-20 text-white" strokeWidth={3} />,
          headline: "Pause validée",
          sub: overlay.participantName ?? "Participant",
          meta,
        };
      case "duplicate":
        return {
          bg: "bg-rose-600",
          icon: <X className="h-20 w-20 text-white" strokeWidth={3} />,
          headline: "Déjà servi(e)",
          sub: overlay.participantName ?? overlay.participantId,
          meta,
        };
      case "unknown":
        return {
          bg: "bg-amber-500",
          icon: <AlertTriangle className="h-20 w-20 text-white" strokeWidth={2.5} />,
          headline: "Badge non reconnu",
          sub: overlay.participantId,
        };
      case "error":
        return {
          bg: "bg-slate-700",
          icon: <WifiOff className="h-20 w-20 text-white" strokeWidth={2.5} />,
          headline: "Erreur, réessayez",
          sub: "Vérifiez votre connexion",
        };
    }
  })();

  return (
    <AnimatePresence>
      {overlay && theme && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={cn(
            "fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center text-white",
            theme.bg,
          )}
          aria-live="assertive"
          role="status"
        >
          <motion.div
            key={overlay.state}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="flex flex-col items-center gap-5"
          >
            {theme.icon}
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {theme.headline}
            </h2>
            {theme.sub && (
              <p className="max-w-md break-words text-xl font-medium opacity-95">
                {theme.sub}
              </p>
            )}
            {theme.meta && <p className="text-lg opacity-90">{theme.meta}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
