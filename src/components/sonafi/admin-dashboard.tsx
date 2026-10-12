"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Users,
  QrCode,
  History,
  Download,
  ArrowLeft,
  Settings2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  type DayDetail,
  type DayNumber,
  DAYS,
  DAY_LABELS,
  formatTimestamp,
  type EffectivePause,
} from "@/lib/sonafi";
import { PauseOverrideBar } from "@/components/sonafi/pause-override-bar";
import { ConfigCard } from "@/components/sonafi/config-card";
import { BadgesTab } from "@/components/sonafi/badges-tab";
import { ParticipantsTab } from "@/components/sonafi/participants-tab";
import { StatsTab } from "@/components/sonafi/stats-tab";

// ---- Design tokens (from the Gestionnaire mockup) --------------------------
const PURPLE_BG = "#F4F0F8";
const PURPLE_DEEP = "#3B2370";
const PURPLE_TEXT = "#24173F";
const PURPLE_MUTED = "#5E5476";
const PURPLE_CARD_BORDER = "#E4DDEE";
const PURPLE_SEGMENT_BG = "#E8E1F2";
const PURPLE_TRACK = "#EAE4F2";
const PURPLE_ICON_TILE = "#ECE6F7";
const PURPLE_DIVIDER = "#EEE8F5";
const TEAL = "#0F766E";
const ROSE = "#C2255C";

type View = "dashboard" | "participants" | "badges" | "historique" | "config";

interface AdminDashboardProps {
  pause: EffectivePause | null;
  refetchPause: () => void;
  totalParticipants: number | null;
  actual: number | null;
  refetchSettings: () => void;
  onGoHome: () => void;
}

export function AdminDashboard({
  pause,
  refetchPause,
  totalParticipants,
  actual,
  refetchSettings,
  onGoHome,
}: AdminDashboardProps) {
  const [view, setView] = useState<View>("dashboard");
  const [day, setDay] = useState<DayNumber>(1);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDay = useCallback(async () => {
    try {
      const res = await fetch(`/api/sonafi/stats?recent=0&day=${day}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setDetail(data.dayDetail ?? { day, entries: 0, cafe: 0, dejeuner: 0 });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    fetchDay();
    const id = setInterval(fetchDay, 5_000);
    return () => clearInterval(id);
  }, [fetchDay]);

  // ---- Sub-views ----------------------------------------------------------
  if (view === "participants") {
    return <SubView title="Participants" onBack={() => setView("dashboard")}><ParticipantsTab /></SubView>;
  }
  if (view === "badges") {
    return <SubView title="Badges QR" onBack={() => setView("dashboard")}><BadgesTab /></SubView>;
  }
  if (view === "historique") {
    return <SubView title="Historique" onBack={() => setView("dashboard")}><StatsTab /></SubView>;
  }
  if (view === "config") {
    return (
      <SubView title="Configuration" onBack={() => setView("dashboard")}>
        <div className="space-y-4">
          <ConfigCard
            totalParticipants={totalParticipants}
            actual={actual}
            onChanged={refetchSettings}
          />
          <PauseOverrideBar pause={pause} onChanged={refetchPause} />
        </div>
      </SubView>
    );
  }

  // ---- Dashboard ---------------------------------------------------------
  const total = totalParticipants ?? actual ?? 500;

  async function handleExport() {
    try {
      const res = await fetch("/api/sonafi/export?format=csv");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sonafi_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export téléchargé", description: "Le fichier CSV a été téléchargé." });
    } catch {
      toast({ variant: "destructive", title: "Export impossible", description: "Réessayez." });
    }
  }

  return (
    <div
      className="mx-auto flex min-h-[calc(100vh-65px)] max-w-md flex-col"
      style={{ backgroundColor: PURPLE_BG, color: PURPLE_TEXT, fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
    >
      {/* ---- Purple header ---- */}
      <div
        className="flex flex-col gap-3.5 px-5 pb-6 pt-5 text-white"
        style={{ backgroundColor: PURPLE_DEEP, borderRadius: "0 0 28px 28px" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Retour à l'accueil"
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/25"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span
            className="rounded-full px-3 py-1.5 text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            Gestionnaire
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-extrabold tracking-tight">Espace gestionnaire</h1>
          <p className="text-[15px]" style={{ color: "rgba(255,255,255,0.88)" }}>
            Suivi en direct du sommet
          </p>
        </div>
      </div>

      {/* ---- Body ---- */}
      <div className="flex flex-col gap-4 px-5 pt-5">
        {/* Day selector — segmented control */}
        <div
          className="grid grid-cols-3 gap-1 p-1"
          style={{ background: PURPLE_SEGMENT_BG, borderRadius: 16 }}
        >
          {DAYS.map((d) => {
            const active = d === day;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                onClick={() => setDay(d)}
                className={cn(
                  "h-11 rounded-xl text-[15px] font-semibold transition-colors",
                  active ? "bg-white text-[#24173F] font-bold shadow-sm" : "bg-transparent text-[#5E5476]",
                )}
              >
                Jour {d}
              </button>
            );
          })}
        </div>

        {/* Stats card with progress bars */}
        <div
          className="flex flex-col gap-3.5 p-[18px]"
          style={{ background: "#FFFFFF", border: `1px solid ${PURPLE_CARD_BORDER}`, borderRadius: 22 }}
        >
          <p className="text-[15px] font-bold">
            Aujourd'hui, jour {day}
          </p>

          <ProgressBar
            label="Entrées"
            value={detail?.entries ?? 0}
            total={total}
            color={TEAL}
            track={PURPLE_TRACK}
          />
          <ProgressBar
            label="Pause café"
            value={detail?.cafe ?? 0}
            total={total}
            color={ROSE}
            track={PURPLE_TRACK}
          />
          <ProgressBar
            label="Déjeuner"
            value={detail?.dejeuner ?? 0}
            total={total}
            color={ROSE}
            track={PURPLE_TRACK}
          />
        </div>

        {/* Pause override — quick access when a pause is forced */}
        {pause?.source === "override" && (
          <PauseOverrideBar pause={pause} onChanged={refetchPause} />
        )}

        {/* Navigation list */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ background: "#FFFFFF", border: `1px solid ${PURPLE_CARD_BORDER}`, borderRadius: 22 }}
        >
          <NavRow
            icon={<Users className="h-[22px] w-[22px]" />}
            title="Participants"
            subtitle="Importer la liste et les noms"
            onClick={() => setView("participants")}
          />
          <Divider />
          <NavRow
            icon={<QrCode className="h-[22px] w-[22px]" />}
            title="Badges QR"
            subtitle={`Générer et imprimer les ${total} badges`}
            onClick={() => setView("badges")}
          />
          <Divider />
          <NavRow
            icon={<History className="h-[22px] w-[22px]" />}
            title="Historique"
            subtitle="Tous les passages enregistrés"
            onClick={() => setView("historique")}
          />
          <Divider />
          <NavRow
            icon={<Settings2 className="h-[22px] w-[22px]" />}
            title="Configuration"
            subtitle="Nombre de participantes et pause"
            onClick={() => setView("config")}
          />
          <Divider />
          <NavRow
            icon={<Download className="h-[22px] w-[22px]" />}
            title="Exporter"
            subtitle="Télécharger les données (CSV)"
            onClick={handleExport}
          />
        </div>

        {/* Live pause status */}
        <div
          className="flex items-center gap-2.5 rounded-2xl px-4 py-3"
          style={{ background: "#FFFFFF", border: `1px solid ${PURPLE_CARD_BORDER}` }}
        >
          <Clock className="h-4 w-4 shrink-0" style={{ color: PURPLE_MUTED }} />
          <span className="text-[13px]" style={{ color: PURPLE_MUTED }}>
            Pause active :{" "}
            <span className="font-semibold" style={{ color: PURPLE_TEXT }}>
              {pause?.pauseType === "cafe" ? "café" : pause?.pauseType === "dejeuner" ? "déjeuner" : "—"}
            </span>{" "}
            ({pause?.source === "override" ? "forcée par l'admin" : "automatique"})
          </span>
        </div>
      </div>
    </div>
  );
}

// ---- ProgressBar -----------------------------------------------------------

function ProgressBar({
  label,
  value,
  total,
  color,
  track,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  track: string;
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex justify-between text-[15px]">
        <span style={{ color: PURPLE_MUTED, fontWeight: 500 }}>{label}</span>
        <span className="font-bold">
          {value} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded" style={{ background: track }}>
        <motion.div
          className="h-2 rounded"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ---- NavRow ---------------------------------------------------------------

function NavRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 items-center gap-3.5 px-4 py-2.5 text-left transition-colors hover:bg-[#F8F5FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
      style={{ color: PURPLE_TEXT }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: PURPLE_ICON_TILE, color: PURPLE_DEEP }}
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-[13px]" style={{ color: PURPLE_MUTED }}>
          {subtitle}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: PURPLE_MUTED }} />
    </button>
  );
}

function Divider() {
  return <div className="mx-4 h-px" style={{ background: PURPLE_DIVIDER }} />;
}

// ---- SubView (wrapper for the detail pages) --------------------------------

function SubView({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-auto max-w-md"
      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
    >
      <div
        className="sticky top-[65px] z-20 -mx-4 mb-3 flex items-center gap-3 px-4 py-3 sm:-mx-6 sm:px-6"
        style={{ background: PURPLE_DEEP, color: "#fff" }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/25"
          style={{ background: "rgba(255,255,255,0.18)" }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default AdminDashboard;
