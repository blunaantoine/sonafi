"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Loader2,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DAY_LABELS, type DayNumber } from "@/lib/sonafi";
import { C } from "@/lib/design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResultState =
  | "loading"
  | "success"
  | "duplicate"
  | "unknown"
  | "error";

export interface OverlayState {
  state: ResultState;
  participantId: string;
  participantName?: string;
  day: DayNumber;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Per-state theming
// ---------------------------------------------------------------------------

/** Amber used for the unknown-badge overlay (not in the design tokens). */
const AMBER_BG = "#F59E0B";
/** Gray used for the generic error overlay. */
const GRAY_BG = "#6B7280";

function bgFor(state: ResultState): string {
  switch (state) {
    case "loading":
      // Reuse the dark viewfinder colour, slightly opaque.
      return C.viewfinder;
    case "success":
      return C.success;
    case "duplicate":
      return C.warning;
    case "unknown":
      return AMBER_BG;
    case "error":
      return GRAY_BG;
  }
}

function headlineFor(state: ResultState): string {
  switch (state) {
    case "loading":
      return "Vérification…";
    case "success":
      return "Entrée enregistrée";
    case "duplicate":
      return "Déjà enregistrée aujourd'hui";
    case "unknown":
      return "Badge non reconnu";
    case "error":
      return "Erreur, réessayez";
  }
}

// ---------------------------------------------------------------------------
// ResultIcon — large white circle with the verdict glyph inside
// ---------------------------------------------------------------------------

function ResultIcon({ state }: { state: ResultState }) {
  if (state === "loading") {
    return <Loader2 className="h-16 w-16 animate-spin text-white" />;
  }

  const Icon =
    state === "success"
      ? Check
      : state === "duplicate"
        ? X
        : state === "unknown"
          ? AlertTriangle
          : WifiOff;

  const strokeWidth = state === "success" || state === "duplicate" ? 3 : 2.5;

  return (
    <div
      className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/30 bg-white/15 backdrop-blur-sm"
      aria-hidden
    >
      <Icon className="h-14 w-14 text-white" strokeWidth={strokeWidth} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VerificationResultOverlay — full-screen verdict shown after each scan
// ---------------------------------------------------------------------------

export interface VerificationResultOverlayProps {
  overlay: OverlayState | null;
  /** Called when the user taps "Scanner le suivant" (or the auto-dismiss fires). */
  onDismiss: () => void;
}

export function VerificationResultOverlay({
  overlay,
  onDismiss,
}: VerificationResultOverlayProps) {
  return (
    <AnimatePresence>
      {overlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center text-white"
          style={{ backgroundColor: bgFor(overlay.state) }}
          role="status"
          aria-live="assertive"
        >
          <motion.div
            key={overlay.state}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="flex flex-col items-center gap-5"
          >
            <ResultIcon state={overlay.state} />

            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {headlineFor(overlay.state)}
            </h2>

            {/* Participant name (or id, when no name is known) */}
            {overlay.state !== "loading" && (
              <p className="max-w-md break-words text-xl font-medium opacity-95">
                {overlay.participantName ?? overlay.participantId}
              </p>
            )}

            {/* Duplicate-specific extra hint */}
            {overlay.state === "duplicate" && (
              <p className="text-base opacity-90">
                A déjà été enregistrée le{" "}
                {DAY_LABELS[overlay.day].toLowerCase()}.
              </p>
            )}

            {/* Unknown-specific extra hint */}
            {overlay.state === "unknown" && (
              <p className="max-w-sm text-base opacity-90">
                Ce badge n&rsquo;est pas dans la liste des participantes.
              </p>
            )}

            {/* Error-specific extra hint */}
            {overlay.state === "error" && (
              <p className="text-base opacity-90">Vérifiez votre connexion.</p>
            )}

            {/* Action button — hidden while loading (the request hasn't finished). */}
            {overlay.state !== "loading" && (
              <Button
                type="button"
                onClick={onDismiss}
                className="mt-4 h-12 border border-white/30 bg-white/15 px-8 text-base font-semibold text-white backdrop-blur hover:bg-white/25"
                style={{ borderRadius: 999 }}
              >
                Scanner le suivant
              </Button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
