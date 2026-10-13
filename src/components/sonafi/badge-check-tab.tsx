"use client";

/**
 * BadgeCheckTab — admin-only badge verifier.
 *
 * Scans (camera or photo) or manually types a badge, then shows the
 * participant's status and full history: every validated pause and every
 * recorded entry, grouped by summit day.
 *
 * The admin can also CORRECT a badge that was scanned by mistake: each
 * history row has an "annuler" button (two-tap confirm) and the panel has a
 * full "réinitialiser le badge" action — both go through
 * POST /api/sonafi/badge/amend which re-validates the admin code.
 *
 * The camera uses the same hardened lifecycle as the restoration /
 * verification scanners: single instance (startingRef mutex), clean teardown
 * releasing the tracks, stop/resume, front/back switch, visibilitychange
 * handling, no auto-start (iOS needs a user gesture). The camera keeps
 * running between lookups so several badges can be checked back to back.
 *
 * Privileged: every lookup sends the admin code (sessionStorage) which the
 * server re-validates — a stale admin session gets a clear error.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  SwitchCamera,
  Undo2,
  Video,
  VideoOff,
} from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { friendlyCameraError, rawErrorLabel } from "@/lib/camera";
import { decodeQrFromFile } from "@/lib/qr-photo";
import { DAY_LABELS, PAUSE_META, formatTimestamp } from "@/lib/sonafi";
import { C } from "@/lib/design-tokens";

// ---- Design tokens (admin navy theme) --------------------------------------
const NAVY = C.gestionnaire;
const TINT = C.gestionnaireTint;
const TEXT_PRIMARY = C.textPrimary;
const TEXT_MUTED = C.textSecondary;
const CARD_BORDER = "#E5E7EB";
const OK_GREEN = "#0F766E";
const ERROR_RED = "#DC2626";

const QR_READER_ID = "sonafi-admin-badge-qr-reader";
/** Ignore repeated decodes of the same code within this window (ms). */
const DEBOUNCE_MS = 2500;

// ---- Types -----------------------------------------------------------------

interface BadgeHistory {
  participant: { id: string; name: string };
  pauses: { day: number; pauseType: string; timestamp: string }[];
  entries: { day: number; timestamp: string }[];
}

type CheckState =
  | { kind: "idle" }
  | { kind: "loading"; code: string }
  | { kind: "unknown"; code: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: BadgeHistory };

/** One correction action on a badge's history (see /api/sonafi/badge/amend). */
type AmendAction =
  | { action: "delete_pause"; day: number; pauseType: "cafe" | "dejeuner" }
  | { action: "delete_entry"; day: number }
  | { action: "reset_all" };

interface AmendFeedback {
  kind: "ok" | "error";
  text: string;
}

export function BadgeCheckTab() {
  // ----- Camera state (same hardened lifecycle as the scan tabs) ------------
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRawError, setCameraRawError] = useState<string | null>(null);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const startingRef = useRef(false);
  const currentCamIdRef = useRef<string | null>(null);

  // ----- Photo fallback ------------------------------------------------------
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // ----- Lookup flow ---------------------------------------------------------
  const lastScanRef = useRef<{ id: string; ts: number }>({ id: "", ts: 0 });
  const inFlightRef = useRef(false);
  const [manual, setManual] = useState("");
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  /** Bumped on every lookup — pending amend responses for a previous badge
   *  are dropped so they can't overwrite the newly displayed one. */
  const panelSeqRef = useRef(0);

  // ----- Amend flow (correct a badge that was scanned by mistake) -----------
  const [amendBusy, setAmendBusy] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AmendFeedback | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- checkBadge: POST /api/sonafi/badge/check (admin pin re-validated) ---
  const checkBadge = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || inFlightRef.current) return;
    inFlightRef.current = true;
    panelSeqRef.current += 1; // invalidate any pending amend response
    setConfirmKey(null);
    setFeedback(null);
    setState({ kind: "loading", code });

    try {
      const pin = sessionStorage.getItem("sonafi.adminPin") ?? "";
      const res = await fetch("/api/sonafi/badge/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        participant?: { id: string; name: string };
        pauses?: { day: number; pauseType: string; timestamp: string }[];
        entries?: { day: number; timestamp: string }[];
      };

      if (res.status === 404) {
        setState({ kind: "unknown", code });
      } else if (res.status === 401) {
        setState({
          kind: "error",
          message:
            "Session administrateur expirée. Retournez à l'accueil et resaisissez le code.",
        });
      } else if (res.ok && data.success && data.participant) {
        setState({
          kind: "ok",
          data: {
            participant: data.participant,
            pauses: data.pauses ?? [],
            entries: data.entries ?? [],
          },
        });
      } else {
        setState({
          kind: "error",
          message: data.message ?? "Vérification impossible. Réessayez.",
        });
      }
    } catch {
      setState({ kind: "error", message: "Réseau indisponible. Réessayez." });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // ----- amendBadge: POST /api/sonafi/badge/amend (admin corrections) -------
  /** Two-tap confirm lives in the panel; this performs the action and swaps
   *  the refreshed history in place (single round-trip). */
  const amendBadge = useCallback(
    async (act: AmendAction, key: string) => {
      if (amendBusy) return;
      if (state.kind !== "ok") return;
      const seq = panelSeqRef.current;
      const code = state.data.participant.id;
      const pin = sessionStorage.getItem("sonafi.adminPin") ?? "";

      setAmendBusy(key);
      setConfirmKey(null);
      setFeedback(null);

      try {
        const res = await fetch("/api/sonafi/badge/amend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, code, ...act }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          deleted?: { pauses: number; entries: number };
          participant?: { id: string; name: string };
          pauses?: { day: number; pauseType: string; timestamp: string }[];
          entries?: { day: number; timestamp: string }[];
        };

        // Another badge was scanned meanwhile — the response is obsolete.
        if (seq !== panelSeqRef.current) return;

        if (res.status === 401) {
          setState({
            kind: "error",
            message:
              "Session administrateur expirée. Retournez à l'accueil et resaisissez le code.",
          });
          return;
        }

        if (res.ok && data.success && data.participant) {
          setState({
            kind: "ok",
            data: {
              participant: data.participant,
              pauses: data.pauses ?? [],
              entries: data.entries ?? [],
            },
          });
          const removed =
            (data.deleted?.pauses ?? 0) + (data.deleted?.entries ?? 0);
          if (act.action === "reset_all") {
            setFeedback({
              kind: "ok",
              text:
                removed > 0
                  ? `Badge réinitialisé — ${removed} enregistrement${removed > 1 ? "s" : ""} effacé${removed > 1 ? "s" : ""}.`
                  : "Badge réinitialisé — aucun enregistrement à effacer.",
            });
          } else if (removed > 0) {
            setFeedback({
              kind: "ok",
              text: "Scan annulé — l'historique est mis à jour.",
            });
          } else {
            setFeedback({
              kind: "error",
              text: "Aucun enregistrement correspondant à annuler.",
            });
          }
        } else {
          setFeedback({
            kind: "error",
            text: data.message ?? "Modification impossible. Réessayez.",
          });
        }
      } catch {
        if (seq === panelSeqRef.current) {
          setFeedback({
            kind: "error",
            text: "Réseau indisponible. Réessayez.",
          });
        }
      } finally {
        setAmendBusy(null);
      }
    },
    [amendBusy, state],
  );

  /** Arm the two-tap confirm on a row (auto-disarms after 4 s). */
  const requestConfirm = useCallback((key: string) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmKey(key);
    confirmTimerRef.current = setTimeout(() => setConfirmKey(null), 4000);
  }, []);

  // ----- handleScan: the camera callback (lock + debounce, same as scanners) -
  const handleScan = useCallback(
    (decoded: string) => {
      if (inFlightRef.current) return;
      const value = decoded.trim();
      if (!value) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last.id === value && now - last.ts < DEBOUNCE_MS) return;
      lastScanRef.current = { id: value, ts: now };
      void checkBadge(value);
    },
    [checkBadge],
  );

  // ----- startCamera: permission probe, then html5-qrcode (mutex-guarded) ----
  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (startingRef.current) return; // one start at a time
      startingRef.current = true;
      try {
        setCameraError(null);
        setCameraRawError(null);
        setCameraReady(false);
        setScanPaused(false);
        setCameraRequested(true);

        const probeConstraints: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: "environment" } };
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError(
              "La caméra n'est pas supportée par ce navigateur. Sur iPhone, utilisez Safari.",
            );
            return;
          }
          const probe = await navigator.mediaDevices.getUserMedia({
            video: probeConstraints,
            audio: false,
          });
          probe.getTracks().forEach((t) => t.stop());
        } catch (err) {
          setCameraRawError(rawErrorLabel(err));
          setCameraError(friendlyCameraError(err));
          setCameraReady(false);
          return;
        }

        try {
          const { Html5Qrcode } = await import("html5-qrcode");
          try {
            const cams = await Html5Qrcode.getCameras();
            setHasMultipleCameras(cams.length > 1);
          } catch {
            /* labels unavailable — the switch simply stays hidden */
          }

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

          const instance = new Html5Qrcode(QR_READER_ID, { verbose: false });
          html5Ref.current = instance;

          // html5-qrcode accepts a device-id string or { facingMode: string |
          // { exact } } only — plain string = soft constraint (rear preferred).
          const startConfig: string | MediaTrackConstraints =
            deviceId ?? { facingMode: "environment" };

          // No qrbox — the library-drawn scan box never aligns with the CSS
          // corner brackets over the object-cover video (misaligned double
          // frame). Full-frame decode, the white brackets are the only guide.
          await instance.start(
            startConfig,
            { fps: 10 },
            handleScan,
            () => {
              /* per-frame decode errors are noisy — ignore */
            },
          );

          const video = document.querySelector<HTMLVideoElement>(
            `#${QR_READER_ID} video`,
          );
          const track =
            video?.srcObject instanceof MediaStream
              ? video.srcObject.getVideoTracks()[0]
              : undefined;
          currentCamIdRef.current = track?.getSettings().deviceId ?? null;
          setCameraReady(true);
        } catch (err) {
          setCameraRawError(rawErrorLabel(err));
          setCameraError(friendlyCameraError(err));
          setCameraReady(false);
        }
      } finally {
        startingRef.current = false;
      }
    },
    [handleScan],
  );

  // ----- stopCamera / toggleScan / switchCamera ------------------------------
  const stopCamera = useCallback(async () => {
    const inst = html5Ref.current;
    html5Ref.current = null;
    setCameraReady(false);
    setScanPaused(true);
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
  }, []);

  const toggleScan = useCallback(async () => {
    if (html5Ref.current) {
      await stopCamera();
    } else {
      await startCamera(currentCamIdRef.current ?? undefined);
    }
  }, [startCamera, stopCamera]);

  const switchCamera = useCallback(async () => {
    if (startingRef.current) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const cams = await Html5Qrcode.getCameras();
      if (cams.length < 2) return;
      const next =
        cams.find((c) => c.id !== currentCamIdRef.current) ?? cams[0];
      currentCamIdRef.current = next.id;
      await startCamera(next.id);
    } catch {
      /* ignore — enumeration failed, keep the current stream */
    }
  }, [startCamera]);

  // ----- visibilitychange: pause the decode loop while the tab is hidden -----
  useEffect(() => {
    const onVisibility = () => {
      const inst = html5Ref.current;
      if (!inst) return;
      try {
        if (document.hidden) {
          if (inst.isScanning) inst.pause(true);
        } else if (cameraReady && !scanPaused) {
          inst.resume();
        }
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [cameraReady, scanPaused]);

  // ----- mount: no auto-start (user gesture required). Unmount: full cleanup -
  useEffect(() => {
    return () => {
      startingRef.current = false;
      inFlightRef.current = false;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      const inst = html5Ref.current;
      html5Ref.current = null;
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
  }, []);

  // ----- handlePhotoFile: decode a badge photo with jsQR ---------------------
  const handlePhotoFile = useCallback(
    async (file: File) => {
      setPhotoError(null);
      setPhotoBusy(true);
      try {
        const decoded = await decodeQrFromFile(file);
        if (!decoded || !decoded.trim()) {
          setPhotoError(
            "Aucun QR détecté sur cette photo. Approchez-vous du badge et réessayez.",
          );
          return;
        }
        await checkBadge(decoded.trim());
      } catch {
        setPhotoError("Impossible de lire la photo. Réessayez.");
      } finally {
        setPhotoBusy(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    },
    [checkBadge],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-10">
      {/* ===== Viewfinder ===== */}
      <section aria-label="Caméra de vérification">
        <div
          className="relative w-full overflow-hidden"
          style={{
            backgroundColor: C.viewfinder,
            borderRadius: 20,
            height: "min(44vh, 340px)",
            minHeight: 220,
          }}
        >
          <div
            id={QR_READER_ID}
            className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
          />

          {cameraReady && !cameraError && (
            <>
              {/* Corner brackets */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[64%] w-[64%]">
                  <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-lg border-l-4 border-t-4 border-white" />
                  <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-lg border-r-4 border-t-4 border-white" />
                  <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-lg border-b-4 border-l-4 border-white" />
                  <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-lg border-b-4 border-r-4 border-white" />
                </div>
              </div>
              <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-sm font-medium text-white/80">
                Scannez le badge à vérifier
              </p>

              {/* Stop / switch controls */}
              <div className="absolute right-3 top-3 z-10 flex gap-2">
                <button
                  type="button"
                  onClick={() => void toggleScan()}
                  aria-label="Arrêter le scan"
                  title="Arrêter le scan"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60"
                >
                  <VideoOff className="h-5 w-5" />
                </button>
                {hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={() => void switchCamera()}
                    aria-label="Changer de caméra"
                    title="Changer de caméra"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60"
                  >
                    <SwitchCamera className="h-5 w-5" />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Activation prompt */}
          {!cameraRequested && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <ScanLine className="h-11 w-11" style={{ color: "#8FA8CC" }} strokeWidth={1.8} />
              <div>
                <p className="text-base font-semibold">Vérifier un badge</p>
                <p className="mt-1 max-w-xs text-sm text-white/75">
                  Activez la caméra puis scannez le QR d&apos;un participant
                  pour voir son statut et son historique.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="mt-1 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-bold text-gray-900 shadow-md transition-transform active:scale-95"
                style={{ color: NAVY }}
              >
                <Camera className="h-5 w-5" />
                Activer la caméra
              </button>
            </div>
          )}

          {/* Initialising */}
          {cameraRequested && !cameraReady && !cameraError && !scanPaused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/85">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Activation de la caméra…</p>
            </div>
          )}

          {/* Stopped */}
          {scanPaused && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <Video className="h-9 w-9" style={{ color: "#8FA8CC" }} strokeWidth={1.8} />
              <p className="text-sm font-medium">Scan arrêté</p>
              <button
                type="button"
                onClick={() => void toggleScan()}
                className="mt-1 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-bold shadow-md transition-transform active:scale-95"
                style={{ color: NAVY }}
              >
                <Video className="h-5 w-5" />
                Reprendre le scan
              </button>
            </div>
          )}

          {/* Camera error */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <AlertTriangle className="h-9 w-9" style={{ color: C.warningSoft }} />
              <p className="max-w-xs text-sm leading-relaxed text-white/90">
                {cameraError}
              </p>
              {cameraRawError && (
                <p className="max-w-xs break-all font-mono text-[10px] leading-snug text-white/50">
                  {cameraRawError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void startCamera()}
                className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-base font-semibold text-gray-900 shadow-sm transition-transform active:scale-95"
              >
                <RefreshCw className="h-5 w-5" />
                Réessayer
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ===== Manual entry + photo fallback ===== */}
      <div
        className="flex flex-col gap-3 p-4"
        style={{ background: "#FFFFFF", border: `1px solid ${CARD_BORDER}`, borderRadius: 18 }}
      >
        <p className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>
          Ou saisir le badge manuellement
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = manual.trim();
            if (!v) return;
            setManual("");
            void checkBadge(v);
          }}
        >
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Code QR ou ID (ex. ID0042)"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Code du badge"
            className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
          />
          <button
            type="submit"
            disabled={!manual.trim() || state.kind === "loading"}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: NAVY }}
          >
            <Search className="h-4 w-4" />
            Vérifier
          </button>
        </form>

        {photoError && (
          <p className="text-center text-xs" style={{ color: ERROR_RED }} role="alert">
            {photoError}
          </p>
        )}
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={photoBusy}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ borderColor: CARD_BORDER, color: NAVY }}
        >
          {photoBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Lecture de la photo…
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              Scanner via photo du badge
            </>
          )}
        </button>
      </div>

      {/* ===== Result panel ===== */}
      <ResultPanel
        state={state}
        amendBusy={amendBusy}
        confirmKey={confirmKey}
        feedback={feedback}
        onRequestConfirm={requestConfirm}
        onAmend={amendBadge}
      />

      {/* Hidden photo input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (!f.type.startsWith("image/")) {
            setPhotoError("Choisissez une image (photo du badge).");
            return;
          }
          void handlePhotoFile(f);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultPanel — status + history, grouped by day + admin corrections
// ---------------------------------------------------------------------------

function ResultPanel({
  state,
  amendBusy,
  confirmKey,
  feedback,
  onRequestConfirm,
  onAmend,
}: {
  state: CheckState;
  amendBusy: string | null;
  confirmKey: string | null;
  feedback: AmendFeedback | null;
  onRequestConfirm: (key: string) => void;
  onAmend: (act: AmendAction, key: string) => void;
}) {
  if (state.kind === "idle") return null;

  if (state.kind === "loading") {
    return (
      <div
        className="flex items-center gap-3 p-4"
        style={{ background: "#FFFFFF", border: `1px solid ${CARD_BORDER}`, borderRadius: 18 }}
      >
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: NAVY }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
            Vérification en cours…
          </p>
          <p className="break-all text-xs" style={{ color: TEXT_MUTED }}>
            {state.code}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "unknown") {
    return (
      <div
        className="flex items-start gap-3 p-4"
        style={{ background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: 18 }}
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: ERROR_RED }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: ERROR_RED }}>
            Badge non reconnu
          </p>
          <p className="break-all text-xs" style={{ color: TEXT_MUTED }}>
            {state.code} — ce code ne correspond à aucun participant. Vérifiez
            la saisie ou réimprimez le badge.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="flex items-start gap-3 p-4"
        style={{ background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: 18 }}
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: ERROR_RED }} />
        <p className="text-sm" style={{ color: ERROR_RED }}>
          {state.message}
        </p>
      </div>
    );
  }

  // kind === "ok"
  const { participant, pauses, entries } = state.data;

  // Group history by summit day.
  const daySet = new Set<number>();
  for (const p of pauses) daySet.add(p.day);
  for (const e of entries) daySet.add(e.day);
  const days = [...daySet].sort((a, b) => a - b);

  const cafeCount = pauses.filter((p) => p.pauseType === "cafe").length;
  const dejCount = pauses.filter((p) => p.pauseType === "dejeuner").length;

  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{ background: "#FFFFFF", border: `1px solid ${OK_GREEN}40`, borderRadius: 18 }}
    >
      {/* Participant header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold"
          style={{ backgroundColor: TINT, color: NAVY }}
          aria-hidden
        >
          {participant.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold" style={{ color: TEXT_PRIMARY }}>
            {participant.name}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: TINT, color: NAVY }}
            >
              {participant.id}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "rgba(15,118,110,0.12)", color: OK_GREEN }}
            >
              Badge vérifié
            </span>
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label="Résumé du participant"
      >
        <SummaryChip label="Entrées" value={entries.length} color={C.entriesBar} />
        <SummaryChip label="Cafés" value={cafeCount} color={C.pauseCafe} />
        <SummaryChip label="Déjeuners" value={dejCount} color={C.pauseCafe} />
      </div>

      {/* Amend feedback (scan cancelled / reset done / error) */}
      {feedback && (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{
            background: feedback.kind === "ok" ? "rgba(15,118,110,0.10)" : "#FEF2F2",
            color: feedback.kind === "ok" ? OK_GREEN : ERROR_RED,
          }}
        >
          {feedback.text}
        </p>
      )}

      {/* Per-day history — each row can be cancelled by the admin */}
      {days.length === 0 ? (
        <p className="py-2 text-center text-sm" style={{ color: TEXT_MUTED }}>
          Aucun passage enregistré pour ce participant.
        </p>
      ) : (
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {days.map((d) => {
            const dayPauses = pauses.filter((p) => p.day === d);
            const dayEntries = entries.filter((e) => e.day === d);
            return (
              <div key={d} className="flex flex-col gap-1.5">
                <p
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: TEXT_MUTED }}
                >
                  {DAY_LABELS[d] ?? `Jour ${d}`}
                </p>
                {dayEntries.map((e, i) => {
                  const rowKey = `e-${d}`;
                  return (
                    <HistoryRow
                      key={`${rowKey}-${i}`}
                      emoji="✅"
                      label="Entrée enregistrée"
                      time={formatTimestamp(e.timestamp)}
                      color={C.entriesBar}
                      busy={amendBusy === rowKey}
                      confirming={confirmKey === rowKey}
                      onAmendTap={
                        amendBusy && amendBusy !== rowKey
                          ? undefined
                          : () => {
                              if (confirmKey === rowKey) {
                                onAmend({ action: "delete_entry", day: d }, rowKey);
                              } else {
                                onRequestConfirm(rowKey);
                              }
                            }
                      }
                    />
                  );
                })}
                {dayPauses.map((p, i) => {
                  const meta = PAUSE_META[p.pauseType as "cafe" | "dejeuner"];
                  const rowKey = `p-${d}-${p.pauseType}`;
                  return (
                    <HistoryRow
                      key={`${rowKey}-${i}`}
                      emoji={meta?.emoji ?? "•"}
                      label={meta?.label ?? p.pauseType}
                      time={formatTimestamp(p.timestamp)}
                      color={C.pauseCafe}
                      busy={amendBusy === rowKey}
                      confirming={confirmKey === rowKey}
                      onAmendTap={
                        amendBusy && amendBusy !== rowKey
                          ? undefined
                          : () => {
                              if (confirmKey === rowKey) {
                                onAmend(
                                  {
                                    action: "delete_pause",
                                    day: d,
                                    pauseType: p.pauseType as "cafe" | "dejeuner",
                                  },
                                  rowKey,
                                );
                              } else {
                                onRequestConfirm(rowKey);
                              }
                            }
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Danger zone — wipe the badge's whole history (two-tap confirm) */}
      {days.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {confirmKey === "reset-all" ? (
            <button
              type="button"
              disabled={amendBusy !== null}
              onClick={() => onAmend({ action: "reset_all" }, "reset-all")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: ERROR_RED }}
            >
              {amendBusy === "reset-all" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              Confirmer la réinitialisation complète
            </button>
          ) : (
            <button
              type="button"
              disabled={amendBusy !== null}
              onClick={() => onRequestConfirm("reset-all")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ borderColor: ERROR_RED, color: ERROR_RED }}
            >
              <RotateCcw className="h-4 w-4" />
              Réinitialiser le badge (effacer tous les scans)
            </button>
          )}
          <p className="text-center text-[11px]" style={{ color: TEXT_MUTED }}>
            À utiliser si un badge a été scanné par erreur — le participant
            repart à zéro et peut être rescané normalement.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-xl py-2"
      style={{ background: TINT }}
    >
      <span className="text-lg font-extrabold leading-none" style={{ color: NAVY }}>
        {value}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
        {label}
      </span>
      <span className="sr-only" style={{ color }}>
        {label} : {value}
      </span>
    </div>
  );
}

function HistoryRow({
  emoji,
  label,
  time,
  busy,
  confirming,
  onAmendTap,
}: {
  emoji: string;
  label: string;
  time: string;
  color: string;
  /** An amend request is running on this row. */
  busy?: boolean;
  /** Two-tap confirm armed on this row. */
  confirming?: boolean;
  /** Present = the row is amendable (admin can cancel this scan). */
  onAmendTap?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3 py-2"
      style={{ background: C.pageBg }}
    >
      <span className="text-base" aria-hidden>
        {emoji}
      </span>
      <span className="flex-1 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>
        {label}
      </span>
      <span className="text-[12px] tabular-nums" style={{ color: TEXT_MUTED }}>
        {time}
      </span>
      {onAmendTap &&
        (confirming ? (
          <button
            type="button"
            onClick={onAmendTap}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-bold text-white transition-transform active:scale-95"
            style={{ backgroundColor: ERROR_RED }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            Confirmer ?
          </button>
        ) : (
          <button
            type="button"
            onClick={onAmendTap}
            aria-label={`Annuler : ${label} de ${time}`}
            title="Annuler ce scan"
            className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{ color: TEXT_MUTED }}
          >
            <Undo2 className="h-4 w-4" />
          </button>
        ))}
    </div>
  );
}

export default BadgeCheckTab;
