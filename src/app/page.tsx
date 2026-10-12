"use client";

import { useState } from "react";
import {
  IdCard,
  Users,
  BarChart3,
  ScanLine,
  Lock,
  LogOut,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScanTab } from "@/components/sonafi/scan-tab";
import { BadgesTab } from "@/components/sonafi/badges-tab";
import { ParticipantsTab } from "@/components/sonafi/participants-tab";
import { StatsTab } from "@/components/sonafi/stats-tab";
import { PauseOverrideBar } from "@/components/sonafi/pause-override-bar";
import { AdminGate } from "@/components/sonafi/admin-gate";
import { ConfigCard } from "@/components/sonafi/config-card";
import { useTotalScans } from "@/components/sonafi/use-total-scans";
import { useRole } from "@/components/sonafi/use-role";
import { useEffectivePause } from "@/components/sonafi/use-effective-pause";
import { useSettings } from "@/components/sonafi/use-settings";

export type AdminTab = "badges" | "participants" | "stats";

export default function Home() {
  const { role, becomeAdmin, becomeScanner } = useRole();
  const [tab, setTab] = useState<AdminTab>("stats");
  const [gateOpen, setGateOpen] = useState(false);
  const { totalScans } = useTotalScans(role === "scanner");
  const { pause, error: pauseError, refetch: refetchPause } = useEffectivePause();
  const {
    totalParticipants,
    actual,
    refetch: refetchSettings,
  } = useSettings();

  // The displayed count: prefer the configured value, fall back to the actual
  // row count, then to the constant default while loading.
  const displayCount =
    totalParticipants ?? actual ?? 500;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/40 via-background to-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-emerald-100/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <ScanLine className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Sommet Sonafi
              </h1>
              <p className="text-xs text-muted-foreground">
                {role === "admin" ? "Espace administrateur" : "Scanner"} ·{" "}
                {displayCount} participantes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role === "admin" ? (
              <>
                <Badge
                  variant="secondary"
                  className="hidden gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 sm:inline-flex"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  {totalScans} passage{totalScans === 1 ? "" : "s"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={becomeScanner}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Quitter l'admin</span>
                  <span className="sm:hidden">Scanner</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                aria-label="Espace administrateur"
                title="Espace administrateur"
                onClick={() => setGateOpen(true)}
              >
                <Lock className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
        {role === "scanner" ? (
          <ScannerView pauseError={pauseError} />
        ) : (
          <AdminView
            tab={tab}
            setTab={setTab}
            pause={pause}
            refetchPause={refetchPause}
            totalParticipants={totalParticipants}
            actual={actual}
            refetchSettings={refetchSettings}
          />
        )}
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-emerald-100/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-1.5 px-4 py-3 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
          <p>
            Sommet national de la jeune fille · Sonafi · 3 jours · 2 pauses
            par jour
          </p>
          <p className="font-medium text-emerald-700">
            Un scan = un passage par pause et par jour
          </p>
        </div>
      </footer>

      {/* Admin PIN gate */}
      <AdminGate open={gateOpen} onOpenChange={setGateOpen} onSuccess={becomeAdmin} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scanner view — full-screen scan with automatic pause (no tabs, no clutter)
// ---------------------------------------------------------------------------

function ScannerView({ pauseError }: { pauseError: string | null }) {
  return (
    <div className="mx-auto max-w-xl">
      {pauseError && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
          {pauseError}
        </p>
      )}
      <ScanTab />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin view — config + override bar + management tabs (no scan)
// ---------------------------------------------------------------------------

interface AdminViewProps {
  tab: AdminTab;
  setTab: (t: AdminTab) => void;
  pause: ReturnType<typeof useEffectivePause>["pause"];
  refetchPause: () => void;
  totalParticipants: number | null;
  actual: number | null;
  refetchSettings: () => void;
}

function AdminView({
  tab,
  setTab,
  pause,
  refetchPause,
  totalParticipants,
  actual,
  refetchSettings,
}: AdminViewProps) {
  return (
    <div className="space-y-4">
      {/* Participant count — admin-configurable */}
      <ConfigCard
        totalParticipants={totalParticipants}
        actual={actual}
        onChanged={refetchSettings}
      />

      {/* Pause override — always visible to the admin (the "retard" escape hatch) */}
      <PauseOverrideBar pause={pause} onChanged={refetchPause} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <div className="sticky top-[65px] z-20 -mx-4 mb-1 bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-6 sm:px-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="badges" className="gap-1.5">
              <IdCard className="h-4 w-4" />
              <span>Badges</span>
            </TabsTrigger>
            <TabsTrigger value="participants" className="gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Participantes</span>
              <span className="sm:hidden">Liste</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Statistiques</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="badges" className="mt-4">
          <BadgesTab />
        </TabsContent>
        <TabsContent value="participants" className="mt-4">
          <ParticipantsTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
