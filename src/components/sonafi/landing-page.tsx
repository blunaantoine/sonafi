"use client";

import { motion } from "framer-motion";
import {
  CalendarDays,
  ClipboardCheck,
  Globe,
  ShieldCheck,
  Utensils,
} from "lucide-react";

export interface LandingPageProps {
  onSelectScanner: () => void;
  onSelectVerification: () => void;
  onSelectAdmin: () => void;
}

// ---- SONAFI brand palette --------------------------------------------------
const NAVY = "#1E3A6E";
const ORANGE = "#F7941D";
const CREAM = "#FFF8E7";
const EMERALD = "#10b981";

interface RoleCardDef {
  id: "scanner" | "verification" | "admin";
  title: string;
  subtitle: string;
  Icon: typeof Utensils;
  accent: string;
  onSelect: keyof LandingPageProps;
}

const ROLE_CARDS: RoleCardDef[] = [
  {
    id: "scanner",
    title: "Équipe restauration",
    subtitle: "Scanner les pauses",
    Icon: Utensils,
    accent: ORANGE,
    onSelect: "onSelectScanner",
  },
  {
    id: "verification",
    title: "Équipe vérification",
    subtitle: "Enregistrer les entrées",
    Icon: ClipboardCheck,
    accent: EMERALD,
    onSelect: "onSelectVerification",
  },
  {
    id: "admin",
    title: "Administrateur",
    subtitle: "Gestion de l'événement",
    Icon: ShieldCheck,
    accent: NAVY,
    onSelect: "onSelectAdmin",
  },
];

/**
 * Landing page for the Sommet Sonafi app.
 *
 * The first screen every user sees. Three big role buttons route the user into
 * the right experience: scanner (restauration team), verification (verification
 * team), or admin (PIN-gated gestionnaire).
 *
 * Brand: cream background, navy headlines, orange accent, emerald reserved for
 * the verification team so the two "scan" teams stay visually distinct.
 */
export function LandingPage({
  onSelectScanner,
  onSelectVerification,
  onSelectAdmin,
}: LandingPageProps) {
  const handlers: LandingPageProps = {
    onSelectScanner,
    onSelectVerification,
    onSelectAdmin,
  };

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: CREAM }}
    >
      {/* Subtle dot pattern overlay (light-peach dots on the cream). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(247, 148, 29, 0.10) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          opacity: 0.7,
        }}
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-6 sm:py-8">
        {/* ---- Logo block (top center) ---- */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center text-center"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(247, 148, 29, 0.14)" }}
          >
            <Globe
              className="h-9 w-9"
              style={{ color: ORANGE }}
              strokeWidth={2.1}
            />
          </div>
          <div className="mt-3 leading-tight">
            <div
              className="text-sm font-semibold uppercase tracking-tight"
              style={{ color: NAVY }}
            >
              SOMMET
            </div>
            <div
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{ color: NAVY }}
            >
              NATIONAL DES FILLES
            </div>
            <div
              className="text-xl font-black uppercase tracking-tight"
              style={{ color: NAVY }}
            >
              SONAFI
            </div>
          </div>
        </motion.div>

        {/* ---- Hero headline ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="mt-6 text-center sm:mt-7"
        >
          <p className="text-lg font-normal" style={{ color: NAVY }}>
            Maintenant
          </p>
          <h1
            className="text-4xl font-black leading-tight sm:text-5xl"
            style={{ color: NAVY }}
          >
            Place à
          </h1>
          <h1
            className="whitespace-nowrap text-4xl font-black leading-tight sm:text-5xl"
            style={{ color: ORANGE }}
          >
            l&rsquo;impact
          </h1>
        </motion.div>

        {/* ---- Date block ---- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-4 flex items-center justify-center gap-3"
        >
          <CalendarDays
            className="h-5 w-5"
            style={{ color: ORANGE }}
            strokeWidth={2.2}
          />
          <span
            className="block h-5 w-px"
            style={{ backgroundColor: ORANGE }}
            aria-hidden
          />
          <p className="text-sm sm:text-base" style={{ color: NAVY }}>
            <span className="font-bold">22 &bull; 23 &bull; 24</span>{" "}
            <span className="font-semibold" style={{ color: ORANGE }}>
              OCTOBRE
            </span>{" "}
            <span className="font-semibold">2026</span>
          </p>
        </motion.div>

        {/* ---- Role buttons ---- */}
        <div className="mt-7 w-full space-y-3 sm:mt-8">
          {ROLE_CARDS.map((c, idx) => {
            const Icon = c.Icon;
            const handle = handlers[c.onSelect];
            return (
              <motion.button
                key={c.id}
                type="button"
                onClick={handle}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: 0.3 + idx * 0.1,
                  ease: "easeOut",
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                className="group flex h-24 w-full items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-28 sm:gap-5 sm:p-5"
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: c.accent,
                  // @ts-expect-error -- CSS variable consumed by the focus ring below
                  "--tw-ring-color": c.accent,
                }}
                aria-label={`${c.title} — ${c.subtitle}`}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14"
                  style={{ backgroundColor: `${c.accent}26` }}
                >
                  <Icon
                    className="h-6 w-6 sm:h-7 sm:w-7"
                    style={{ color: c.accent }}
                    strokeWidth={2.1}
                  />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className="text-base font-bold leading-tight sm:text-lg"
                    style={{ color: NAVY }}
                  >
                    {c.title}
                  </span>
                  <span className="mt-0.5 text-sm text-gray-500">
                    {c.subtitle}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </main>

      {/* ---- Sticky footer ---- */}
      <footer
        className="relative mt-auto border-t bg-white py-3 text-center"
        style={{ borderColor: ORANGE }}
      >
        <p className="text-xs font-medium" style={{ color: NAVY }}>
          Sommet national de la jeune fille &middot; 22-24 octobre 2026
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
