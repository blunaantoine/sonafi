"use client";

/**
 * Full-screen verdict overlay shown after each pause scan.
 *
 * Renders five states — loading / success / duplicate / unknown / error —
 * each with the layout from the Sommet Sonafi mobile mockup (pages 4 & 5):
 *   • coloured full-bleed background
 *   • top row: "Restauration" (left) + day pill (right, soft-tinted)
 *   • centred icon inside a soft-tinted circle (~150px)
 *   • headline + sub-headline + body lines
 *   • bottom: white pill "Scanner le suivant" button (or "Réessayer" on error)
 *
 * The parent (scan-tab) controls auto-dismiss + camera resume. Tapping the
 * bottom button dismisses immediately and the parent re-arms the scanner.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  ScanLine,
  WifiOff,
  X,
} from "lucide-react";
import {
  DAY_LABELS,
  PAUSE_META,
  type DayNumber,
  type PauseType,
} from "@/lib/sonafi";
import { C } from "@/lib/design-tokens";

export type ScanResultState =
  | "loading"
  | "success"
  | "duplicate"
  | "unknown"
  | "error";

export interface ScanResult {
  state: ScanResultState;
  /** Raw decoded QR string (e.g. "ID0042"). */
  participantId: string;
  /** Resolved participant display name (when known). */
  participantName?: string;
  day: DayNumber;
  pauseType: PauseType;
  /** Server-side timestamp (success only). */
  timestamp?: string;
}

interface ScanResultOverlayProps {
  result: ScanResult | null;
  /** Called when the user taps "Scanner le suivant" / "Réessayer". */
  onScanNext?: () => void;
}

// Short lowercase name used inside sentence fragments like
// "A déjà pris sa pause café le jour 1."
const SHORT_PAUSE_NAME: Record<PauseType, string> = {
  cafe: "café",
  dejeuner: "déjeuner",
  jeux: "jeux",
};

interface OverlayTheme {
  /** Full-bleed background colour. */
  bg: string;
  /** Circle fill (lighter than the background so it stands out). */
  circleBg: string;
  /** Day-pill background (also lighter than the background). */
  pillBg: string;
  /** Headline + sub text colour (almost always white). */
  buttonText: string;
  /** 150px icon node. */
  icon: React.ReactNode;
  /** Big bold headline. */
  headline: string;
  /** Sub-headline (~20px medium). */
  sub?: string;
  /** Optional body lines (~16px regular, white @ 90% opacity). */
  bodyLines?: string[];
  /** Bottom button label. */
  buttonLabel: string;
}

function buildTheme(result: ScanResult): OverlayTheme {
  const pauseLabel = PAUSE_META[result.pauseType].label;
  const dayLabel = DAY_LABELS[result.day];

  switch (result.state) {
    case "loading":
      return {
        bg: C.viewfinder,
        circleBg: "rgba(255,255,255,0.10)",
        pillBg: "rgba(255,255,255,0.20)",
        buttonText: "#FFFFFF",
        icon: <Loader2 className="h-20 w-20 animate-spin text-white" strokeWidth={2.5} />,
        headline: "Vérification…",
        sub: result.participantId,
        buttonLabel: "Scanner le suivant",
      };

    case "success":
      return {
        bg: C.success,
        circleBg: C.successSoft,
        pillBg: C.successSoft,
        buttonText: C.success,
        icon: <Check className="h-20 w-20 text-white" strokeWidth={3} />,
        headline: `${pauseLabel} validée`,
        sub: result.participantName ?? "Participant",
        bodyLines: [`${result.participantId} · ${dayLabel}`],
        buttonLabel: "Scanner le suivant",
      };

    case "duplicate":
      return {
        bg: C.warning,
        circleBg: C.warningCircle,
        pillBg: C.warningSoft,
        buttonText: C.warning,
        icon: <X className="h-20 w-20 text-white" strokeWidth={3} />,
        headline: "Déjà pris aujourd'hui",
        sub: result.participantName ?? "Participant",
        bodyLines: [
          `A déjà pris sa pause ${SHORT_PAUSE_NAME[result.pauseType]} le jour ${result.day}.`,
          "Ne pas servir.",
        ],
        buttonLabel: "Scanner le suivant",
      };

    case "unknown":
      return {
        bg: "#B45309", // amber-700 — distinct from the orange header
        circleBg: "#92400E", // amber-800
        pillBg: "rgba(255,255,255,0.22)",
        buttonText: "#B45309",
        icon: <AlertTriangle className="h-20 w-20 text-white" strokeWidth={2.5} />,
        headline: "Badge non reconnu",
        sub: result.participantId,
        bodyLines: ["Ce badge n'existe pas dans la base."],
        buttonLabel: "Scanner le suivant",
      };

    case "error":
      return {
        bg: "#374151", // gray-700
        circleBg: "#1F2937", // gray-800
        pillBg: "rgba(255,255,255,0.18)",
        buttonText: "#374151",
        icon: <WifiOff className="h-20 w-20 text-white" strokeWidth={2.5} />,
        headline: "Erreur, réessayez",
        sub: "Vérifiez votre connexion",
        buttonLabel: "Réessayer",
      };
  }
}

export function ScanResultOverlay({
  result,
  onScanNext,
}: ScanResultOverlayProps) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          key={result.state + result.participantId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex flex-col p-5 text-white"
          style={{ backgroundColor: buildTheme(result).bg }}
          aria-live="assertive"
          role="status"
        >
          <OverlayContent result={result} onScanNext={onScanNext} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OverlayContent({
  result,
  onScanNext,
}: {
  result: ScanResult;
  onScanNext?: () => void;
}) {
  const theme = buildTheme(result);
  const dayLabel = DAY_LABELS[result.day];

  return (
    <>
      {/* Top bar: "Restauration" + day pill */}
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight sm:text-lg">
          Restauration
        </span>
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: theme.pillBg, color: "#FFFFFF" }}
        >
          {dayLabel}
        </span>
      </div>

      {/* Centred verdict */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <motion.div
          initial={{ scale: 0.55, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="flex h-[150px] w-[150px] items-center justify-center rounded-full"
          style={{ backgroundColor: theme.circleBg }}
          aria-hidden
        >
          {theme.icon}
        </motion.div>

        <motion.h2
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.06 }}
          className="max-w-md text-[34px] font-bold leading-tight tracking-tight"
        >
          {theme.headline}
        </motion.h2>

        {theme.sub && (
          <motion.p
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="max-w-md break-words text-xl font-medium"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            {theme.sub}
          </motion.p>
        )}

        {theme.bodyLines?.map((line, i) => (
          <motion.p
            key={i}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.14 + i * 0.04 }}
            className="max-w-md text-base"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {line}
          </motion.p>
        ))}
      </div>

      {/* Bottom action button */}
      <motion.button
        type="button"
        onClick={onScanNext}
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="flex w-full items-center justify-center gap-2.5 rounded-full bg-white py-4 text-base font-bold shadow-lg transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        style={{ color: theme.buttonText }}
      >
        {result.state === "error" ? (
          <RefreshCw className="h-5 w-5" />
        ) : (
          <ScanLine className="h-5 w-5" />
        )}
        {theme.buttonLabel}
      </motion.button>
    </>
  );
}

export default ScanResultOverlay;
