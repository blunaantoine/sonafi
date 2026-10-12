"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Keyboard,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DAY_LABELS,
  DAYS,
  DEFAULT_TOTAL_PARTICIPANTS,
  formatParticipantId,
  parseParticipantId,
  type DayNumber,
  type StatsResponse,
} from "@/lib/sonafi";
import { C, R } from "@/lib/design-tokens";
import { useRole } from "@/components/sonafi/use-role";
import { useSettings } from "@/components/sonafi/use-settings";
import { cn } from "@/lib/utils";
import {
  VerificationResultOverlay,
  type OverlayState,
} from "@/components/sonafi/verification-overlay";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Element id into which html5-qrcode injects the <video> stream. */
const QR_READER_ID = "sonafi-verification-qr-reader";

/** Ignore repeated decodes of the same code within this window (ms). */
const DEBOUNCE_MS = 2500;

/** How long the result overlay stays on screen after a result (ms). */
const OVERLAY_MS = 2200;

/** Polling interval for the daily entries count (ms). */
const STATS_POLL_MS = 5000;

const LS_DAY = "sonafi.verification.day";

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

export function VerificationView() {
  const { goHome } = useRole();
  const { totalParticipants } = useSettings();

  // ----- Day selector (persisted) ------------------------------------------
  const [day, setDay] = useState<DayNumber>(readDay);
  useEffect(() => writeLS(LS_DAY, day), [day]);

  // Refs mirroring day so the (once-created) scan callback always sees the
  // latest value even if the user switches mid-session.
  const dayRef = useRef(day);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  // ----- Camera state ------------------------------------------------------
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ----- Scan flow state ---------------------------------------------------
  const scanningRef = useRef(true);
  const lastScanRef = useRef<{ id: string; ts: number }>({ id: "", ts: 0 });
  const inFlightRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [lastSuccess, setLastSuccess] = useState<{
    participantId: string;
    participantName?: string;
    day: DayNumber;
  } | null>(null);

  // ----- Daily entries count (poll stats every 5s + after each scan) ------
  const [entriesCount, setEntriesCount] = useState(0);
  const fetchStatsRef = useRef<() => Promise<void>>(async () => {});

  const fetchStats = useCallback(async () => {
    const d = dayRef.current;
    try {
      const res = await fetch(`/api/sonafi/stats?day=${d}&recent=0`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as StatsResponse;
      if (data.dayDetail && data.dayDetail.day === dayRef.current) {
        setEntriesCount(data.dayDetail.entries);
      }
    } catch {
      /* ignore — next poll will retry */
    }
  }, []);

  useEffect(() => {
    fetchStatsRef.current = fetchStats;
  }, [fetchStats]);

  // Initial fetch + polling, re-fetch whenever the day changes.
  useEffect(() => {
    void fetchStats();
    const id = setInterval(() => {
      void fetchStatsRef.current();
    }, STATS_POLL_MS);
    return () => clearInterval(id);
  }, [day, fetchStats]);

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

  // ----- dismissOverlay: clear overlay + resume scanning ------------------
  const dismissOverlay = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setOverlay(null);
    scanningRef.current = true;
    inFlightRef.current = false;
  }, []);

  // ----- recordEntry: POST to the entries API, build overlay -------------
  const recordEntry = useCallback(
    async (participantId: string) => {
      if (inFlightRef.current) return;
      const d = dayRef.current;
      inFlightRef.current = true;
      scanningRef.current = false;

      // Show loading overlay immediately so the user sees feedback.
      setOverlay({
        state: "loading",
        participantId,
        day: d,
      });

      let result: OverlayState;

      try {
        const res = await fetch("/api/sonafi/entries/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId, day: d }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          participant?: { id: string; name: string };
          entry?: { day: number; timestamp: string };
        };

        if (res.ok && data?.success) {
          result = {
            state: "success",
            participantId: data.participant?.id ?? participantId,
            participantName: data.participant?.name,
            day: d,
            timestamp: data.entry?.timestamp,
          };
          setLastSuccess({
            participantId: data.participant?.id ?? participantId,
            participantName: data.participant?.name,
            day: d,
          });
          navigator.vibrate?.(120);
        } else if (res.status === 409) {
          result = {
            state: "duplicate",
            participantId: data.participant?.id ?? participantId,
            participantName: data.participant?.name,
            day: d,
          };
          navigator.vibrate?.([60, 60, 60]);
        } else if (res.status === 404) {
          result = {
            state: "unknown",
            participantId,
            day: d,
          };
          navigator.vibrate?.([60, 60, 60]);
        } else {
          result = { state: "error", participantId, day: d };
        }
      } catch {
        result = { state: "error", participantId, day: d };
      }

      // Show the final result.
      setOverlay(result);

      // Refresh the entries count right away (don't block on it).
      void fetchStatsRef.current();

      // Dismiss the overlay and resume scanning after OVERLAY_MS.
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        dismissOverlay();
      }, OVERLAY_MS);
    },
    [dismissOverlay],
  );

  // ----- handleScan: the callback passed to html5-qrcode ------------------
  const handleScan = useCallback(
    (decoded: string) => {
      if (!scanningRef.current) return;
      if (inFlightRef.current) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last.id === decoded && now - last.ts < DEBOUNCE_MS) return;
      lastScanRef.current = { id: decoded, ts: now };
      void recordEntry(decoded);
    },
    [recordEntry],
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

  // ----- Manual ID entry dialog --------------------------------------------
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Pause the camera while the dialog is open so it doesn't fire spurious scans.
  useEffect(() => {
    const inst = html5Ref.current;
    if (!inst) return;
    try {
      if (manualOpen) inst.pause(true);
      else if (!overlay) inst.resume();
    } catch {
      /* ignore */
    }
  }, [manualOpen, overlay]);

  const submitManual = useCallback(async () => {
    setManualError(null);
    const trimmed = manualId.trim();
    if (!trimmed) {
      setManualError("Entrez un ID de participant.");
      return;
    }

    // Accept both "ID0042" and "42"; normalise to "ID0042".
    const parsed = parseParticipantId(trimmed);
    const normalized =
      Number.isNaN(parsed) && /^ID\d+$/i.test(trimmed)
        ? trimmed.toUpperCase()
        : Number.isNaN(parsed)
          ? null
          : formatParticipantId(parsed);

    if (!normalized) {
      setManualError("Format d'ID invalide. Exemples: ID0042 ou 42.");
      return;
    }

    setManualSubmitting(true);
    try {
      // Close the dialog so the full-screen overlay takes over.
      setManualOpen(false);
      setManualId("");
      await recordEntry(normalized);
    } finally {
      setManualSubmitting(false);
    }
  }, [manualId, recordEntry]);

  // ----- Derived -----------------------------------------------------------
  const totalForBar = totalParticipants ?? DEFAULT_TOTAL_PARTICIPANTS;
  const pct = Math.min(
    100,
    totalForBar > 0 ? (entriesCount / totalForBar) * 100 : 0,
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div
      className="mx-auto w-full max-w-md"
      style={{ backgroundColor: C.pageBg }}
    >
      {/* ---------------------------------------------------------------
          Header block — teal, rounded bottom corners
         --------------------------------------------------------------- */}
      <header
        className="px-4 pb-6 pt-4 sm:px-5 sm:pt-5"
        style={{
          backgroundColor: C.verification,
          borderBottomLeftRadius: R.headerBottom,
          borderBottomRightRadius: R.headerBottom,
        }}
      >
        {/* Top row: back chevron + current-day pill */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goHome}
            aria-label="Retour à l'accueil"
            title="Retour à l'accueil"
            className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{ backgroundColor: C.headerTint }}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
          </button>

          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white sm:text-sm"
            style={{
              backgroundColor: C.verificationSoft,
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}
          >
            {DAY_LABELS[day]}
          </span>
        </div>

        {/* Title + subtitle */}
        <div className="mt-4">
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            Vérification
          </h1>
          <p className="mt-0.5 text-sm font-normal text-white/90 sm:text-base">
            Entrées du jour
          </p>
        </div>
      </header>

      {/* ---------------------------------------------------------------
          Body
         --------------------------------------------------------------- */}
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {/* Day selector — compact 3-pill row */}
        <div className="flex gap-2" role="group" aria-label="Choix du jour">
          {DAYS.map((d) => {
            const active = d === day;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                aria-pressed={active}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-10 sm:text-sm",
                  active
                    ? "text-white shadow-sm"
                    : "border bg-white text-gray-700 hover:bg-gray-50",
                )}
                style={{
                  backgroundColor: active ? C.verification : undefined,
                  borderColor: active ? undefined : C.divider,
                }}
              >
                {DAY_LABELS[d]}
              </button>
            );
          })}
        </div>

        {/* Scanner viewfinder card — dark, full width, ~40% viewport height */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            backgroundColor: C.viewfinder,
            borderRadius: 20,
            height: "40vh",
            minHeight: 280,
            maxHeight: 420,
          }}
          aria-label="Caméra de scan"
        >
          {/* html5-qrcode injects the <video> here */}
          <div
            id={QR_READER_ID}
            className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover [&>video]:bg-black"
          />

          {/* 4 white L-shaped corner brackets (viewfinder reticle) */}
          {cameraReady && !cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[55%] w-[70%]">
                <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-md border-l-4 border-t-4 border-white" />
                <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-md border-r-4 border-t-4 border-white" />
                <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-md border-b-4 border-l-4 border-white" />
                <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-md border-b-4 border-r-4 border-white" />
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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <AlertTriangle className="h-10 w-10 text-rose-300" />
              <p className="max-w-xs text-sm leading-relaxed text-white/90">
                {cameraError}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => void startCamera()}
                className="bg-white/15 text-white backdrop-blur hover:bg-white/25"
                style={{ borderRadius: 999 }}
              >
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          )}

          {/* Centred instruction text (overlay on top of the video) */}
          {cameraReady && !cameraError && (
            <p className="pointer-events-none absolute inset-x-0 bottom-4 px-4 text-center text-sm font-medium text-white sm:text-base">
              Scannez le badge à l&rsquo;arrivée
            </p>
          )}
        </div>

        {/* Success card — shown after a successful scan */}
        {lastSuccess && (
          <div
            className="flex items-center gap-3 p-4 shadow-sm"
            style={{
              backgroundColor: C.surface,
              borderRadius: R.card,
            }}
            aria-live="polite"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: C.successIconBg }}
              aria-hidden
            >
              <Check
                className="h-5 w-5"
                style={{ color: C.successIcon }}
                strokeWidth={3}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[15px] font-semibold leading-tight sm:text-[17px]"
                style={{ color: C.textPrimary }}
              >
                Entrée enregistrée
              </p>
              <p
                className="mt-0.5 truncate text-xs sm:text-sm"
                style={{ color: C.textSecondary }}
              >
                {lastSuccess.participantName ?? "Participant"} ·{" "}
                {lastSuccess.participantId}
              </p>
            </div>
            <span
              className="shrink-0 text-xs font-semibold sm:text-sm"
              style={{ color: C.textPrimary }}
            >
              {DAY_LABELS[lastSuccess.day]}
            </span>
          </div>
        )}

        {/* Progress card — entries today / total */}
        <div
          className="p-4 shadow-sm"
          style={{
            backgroundColor: C.surface,
            borderRadius: R.card,
          }}
        >
          <div className="flex items-center justify-between">
            <p
              className="text-sm font-medium sm:text-[15px]"
              style={{ color: C.textPrimary }}
            >
              Entrées aujourd&rsquo;hui
            </p>
            <p
              className="text-sm font-semibold sm:text-base"
              style={{ color: C.textPrimary }}
            >
              {entriesCount} / {totalForBar}
            </p>
          </div>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: C.track }}
            role="progressbar"
            aria-valuenow={entriesCount}
            aria-valuemin={0}
            aria-valuemax={totalForBar}
            aria-label="Progression des entrées du jour"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${pct}%`,
                backgroundColor: C.verification,
              }}
            />
          </div>
        </div>

        {/* Outlined button — manual ID entry */}
        <button
          type="button"
          onClick={() => {
            setManualError(null);
            setManualId("");
            setManualOpen(true);
          }}
          className="flex h-12 w-full items-center justify-center gap-2 bg-white text-sm font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:text-base"
          style={{
            borderRadius: R.pill,
            border: `2px solid ${C.verification}`,
            color: C.verification,
          }}
        >
          <Keyboard
            className="h-5 w-5"
            style={{ color: C.verification }}
            strokeWidth={2.2}
          />
          Saisir l&rsquo;ID à la main
        </button>
      </div>

      {/* ---------------------------------------------------------------
          Manual ID entry dialog
         --------------------------------------------------------------- */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Saisir l&rsquo;ID à la main</DialogTitle>
            <DialogDescription>
              Entrez l&rsquo;identifiant du participant (ex: ID0042 ou 42).
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitManual();
            }}
          >
            <Input
              autoFocus
              autoComplete="off"
              inputMode="numeric"
              placeholder="ID0042"
              value={manualId}
              onChange={(e) => {
                setManualId(e.target.value);
                if (manualError) setManualError(null);
              }}
              aria-invalid={manualError ? true : undefined}
              className="font-mono"
            />
            {manualError && (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {manualError}
              </p>
            )}
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setManualOpen(false)}
                disabled={manualSubmitting}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={manualSubmitting || !manualId.trim()}
                className="text-white"
                style={{ backgroundColor: C.verification }}
              >
                {manualSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  "Enregistrer l'entrée"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------
          Full-screen result overlay
         --------------------------------------------------------------- */}
      <VerificationResultOverlay
        overlay={overlay}
        onDismiss={dismissOverlay}
      />
    </div>
  );
}

export default VerificationView;
