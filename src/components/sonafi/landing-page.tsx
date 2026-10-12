"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  QrCode,
  Utensils,
} from "lucide-react";
import { C, R } from "@/lib/design-tokens";

export interface LandingPageProps {
  onSelectScanner: () => void;
  onSelectVerification: () => void;
  onSelectAdmin: () => void;
}

// ---- Role-card model -------------------------------------------------------
interface RoleCardDef {
  id: "admin" | "scanner" | "verification";
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  /** Background colour of the 56×56 icon container (role colour). */
  iconBg: string;
  onSelect: keyof LandingPageProps;
}

const ROLE_CARDS: RoleCardDef[] = [
  {
    id: "admin",
    title: "Gestionnaire",
    subtitle: "Suivi, participants et badges",
    Icon: LayoutDashboard,
    iconBg: C.gestionnaire,
    onSelect: "onSelectAdmin",
  },
  {
    id: "scanner",
    title: "Équipe restauration",
    subtitle: "Scanner les pauses café, déjeuner et jeux",
    Icon: Utensils,
    iconBg: C.restauration,
    onSelect: "onSelectScanner",
  },
  {
    id: "verification",
    title: "Équipe vérification",
    subtitle: "Enregistrer les entrées de chaque jour",
    Icon: ClipboardCheck,
    iconBg: C.verification,
    onSelect: "onSelectVerification",
  },
];

/**
 * Landing page — page 1 of the Sonafi mobile mockup.
 *
 * Layout (390×844 reference viewport):
 *   • Header block (~40%) — navy background with 24px rounded bottom corners.
 *     Contains the QR-style logo, the Sonafi title, the subtitle, and the two
 *     translucent pill badges ("3 jours" / "500 participants").
 *   • Body — section title "Choisissez votre espace" + three stacked role
 *     cards. Each card has a 56×56 coloured icon container, a bold title and
 *     a gray subtitle, and a chevron.
 *   • Footer — centred gray disclaimer.
 *
 * Every colour comes from the design-token `C` object; layout radii from `R`.
 * Mobile-first, capped at max-w-md and centred horizontally.
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

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.08, delayChildren: 0.15 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: "easeOut" as const },
    },
  };

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col"
      style={{ backgroundColor: C.pageBg }}
    >
      {/* ---------------- Header block (navy, rounded bottom) ---------------- */}
      <header
        className="px-5 pb-6 pt-safe safe-x"
        style={{
          backgroundColor: C.gestionnaire,
          borderBottomLeftRadius: R.headerBottom,
          borderBottomRightRadius: R.headerBottom,
        }}
      >
        {/* SONAFI logo in a white rounded square */}
        <div
          className="flex h-12 w-12 items-center justify-center overflow-hidden"
          style={{
            backgroundColor: C.surface,
            borderRadius: 12,
          }}
          aria-hidden
        >
          <img
            src="/apple-touch-icon.png"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>

        {/* Title */}
        <h1
          className="mt-4 font-bold leading-tight tracking-tight"
          style={{ color: "#FFFFFF", fontSize: 32 }}
        >
          Sonafi
        </h1>

        {/* Subtitle */}
        <p
          className="mt-1 font-normal leading-snug"
          style={{ color: "#FFFFFF", fontSize: 16 }}
        >
          Sommet national de la jeune fille
        </p>

        {/* Two pill badges */}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <span
            className="inline-flex min-h-[36px] items-center font-semibold"
            style={{
              backgroundColor: "rgba(255,255,255,0.28)",
              color: "#FFFFFF",
              borderRadius: R.pill,
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 14,
              paddingRight: 14,
              fontSize: 14,
            }}
          >
            3 jours
          </span>
          <span
            className="inline-flex min-h-[36px] items-center font-semibold"
            style={{
              backgroundColor: "rgba(255,255,255,0.28)",
              color: "#FFFFFF",
              borderRadius: R.pill,
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 14,
              paddingRight: 14,
              fontSize: 14,
            }}
          >
            500 participants
          </span>
        </div>
      </header>

      {/* ---------------- Body: section title + cards ---------------- */}
      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col px-5 pt-6"
      >
        <h2
          className="font-semibold tracking-tight"
          style={{ color: C.textPrimary, fontSize: 20 }}
        >
          Choisissez votre espace
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          {ROLE_CARDS.map((card) => {
            const Icon = card.Icon;
            const handle = handlers[card.onSelect];
            return (
              <motion.button
                key={card.id}
                type="button"
                onClick={handle}
                variants={item}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                className="flex w-full items-center gap-4 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  borderRadius: R.card,
                  // @ts-expect-error -- consumed by Tailwind's ring utility below
                  "--tw-ring-color": card.iconBg,
                }}
                aria-label={`${card.title} — ${card.subtitle}`}
              >
                {/* 56×56 coloured icon container */}
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center"
                  style={{ backgroundColor: card.iconBg, borderRadius: 14 }}
                  aria-hidden
                >
                  <Icon
                    className="h-7 w-7"
                    style={{ color: "#FFFFFF" }}
                    strokeWidth={2.1}
                  />
                </span>

                {/* Title + subtitle */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="font-bold leading-tight"
                    style={{ color: C.textPrimary, fontSize: 16 }}
                  >
                    {card.title}
                  </span>
                  <span
                    className="mt-1 leading-snug"
                    style={{ color: C.textSecondary, fontSize: 14 }}
                  >
                    {card.subtitle}
                  </span>
                </span>

                {/* Chevron */}
                <ChevronRight
                  className="h-5 w-5 shrink-0"
                  style={{ color: C.iconInactive }}
                  strokeWidth={2.4}
                  aria-hidden
                />
              </motion.button>
            );
          })}
        </div>
      </motion.main>

      {/* ---------------- Footer ---------------- */}
      <footer className="mt-auto px-5 pb-safe pt-2 text-center">
        <p style={{ color: C.textSecondary, fontSize: 13 }}>
          Accès réservé aux équipes du sommet
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
