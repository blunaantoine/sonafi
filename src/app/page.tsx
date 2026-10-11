"use client";

import { useState } from "react";
import { QrCode, IdCard, Users, BarChart3, ScanLine } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScanTab } from "@/components/sonafi/scan-tab";
import { BadgesTab } from "@/components/sonafi/badges-tab";
import { ParticipantsTab } from "@/components/sonafi/participants-tab";
import { StatsTab } from "@/components/sonafi/stats-tab";
import { useTotalScans } from "@/components/sonafi/use-total-scans";
import { TOTAL_PARTICIPANTS } from "@/lib/sonafi";

export type SonafiTab = "scan" | "badges" | "participants" | "stats";

export default function Home() {
  const [tab, setTab] = useState<SonafiTab>("scan");
  const { totalScans } = useTotalScans(tab === "scan");

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
                Gestion des pauses · {TOTAL_PARTICIPANTS} participantes
              </p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="hidden gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 sm:inline-flex"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {totalScans} passage{totalScans === 1 ? "" : "s"} enregistré
            {totalScans === 1 ? "" : "s"}
          </Badge>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SonafiTab)}>
          <div className="sticky top-[65px] z-20 -mx-4 mb-1 bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-6 sm:px-6">
            <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="scan" className="gap-1.5">
              <QrCode className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Scanner</span>
              <span className="sm:hidden">Scan</span>
            </TabsTrigger>
            <TabsTrigger value="badges" className="gap-1.5">
              <IdCard className="h-4 w-4" />
              <span className="hidden sm:inline">Badges</span>
              <span className="sm:hidden">Badges</span>
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

          <TabsContent value="scan" className="mt-4">
            <ScanTab />
          </TabsContent>
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
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-emerald-100/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-1.5 px-4 py-3 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
          <p>
            Sommet national de la jeune fille · Sonafi · 3 jours · 3 pauses
            par jour
          </p>
          <p className="font-medium text-emerald-700">
            Un scan = un passage par pause et par jour
          </p>
        </div>
      </footer>
    </div>
  );
}
