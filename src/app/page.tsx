"use client";

import { useState } from "react";
import { ScanLine, LogOut, Home as HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanTab } from "@/components/sonafi/scan-tab";
import { AdminGate } from "@/components/sonafi/admin-gate";
import { AdminDashboard } from "@/components/sonafi/admin-dashboard";
import { LandingPage } from "@/components/sonafi/landing-page";
import { VerificationView } from "@/components/sonafi/verification-view";
import { useTotalScans } from "@/components/sonafi/use-total-scans";
import { useRole } from "@/components/sonafi/use-role";
import { useEffectivePause } from "@/components/sonafi/use-effective-pause";
import { useSettings } from "@/components/sonafi/use-settings";

export default function Home() {
  const { role, becomeScanner, becomeVerification, becomeAdmin, goHome } = useRole();
  const [gateOpen, setGateOpen] = useState(false);
  const { totalScans } = useTotalScans(role === "scanner" || role === "verification");
  const { pause, error: pauseError, refetch: refetchPause } = useEffectivePause();
  const { totalParticipants, actual, refetch: refetchSettings } = useSettings();

  const displayCount = totalParticipants ?? actual ?? 500;

  // The admin dashboard is self-contained (own purple header + back button),
  // so the app header/footer are hidden in admin mode.
  const showChrome = role !== "home" && role !== "admin";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/40 via-background to-background">
      {/* Header — hidden on the landing page and the admin dashboard */}
      {showChrome && (
        <header className="sticky top-0 z-30 border-b border-emerald-100/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={goHome}
              className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label="Retour à l'accueil"
              title="Retour à l'accueil"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                <ScanLine className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                  Sommet Sonafi
                </h1>
                <p className="text-xs text-muted-foreground">
                  {roleLabel(role)} · {displayCount} participantes
                </p>
              </div>
            </button>

            <div className="flex items-center gap-2">
              {role === "scanner" || role === "verification" ? (
                <>
                  {role === "verification" && (
                    <Badge
                      variant="secondary"
                      className="hidden gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 sm:inline-flex"
                    >
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      {totalScans} entrée{totalScans === 1 ? "" : "s"}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                    onClick={goHome}
                  >
                    <HomeIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Accueil</span>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </header>
      )}

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
        {role === "home" ? (
          <LandingPage
            onSelectScanner={becomeScanner}
            onSelectVerification={becomeVerification}
            onSelectAdmin={() => setGateOpen(true)}
          />
        ) : role === "scanner" ? (
          <ScannerView pauseError={pauseError} />
        ) : role === "verification" ? (
          <VerificationView />
        ) : (
          <AdminDashboard
            pause={pause}
            refetchPause={refetchPause}
            totalParticipants={totalParticipants}
            actual={actual}
            refetchSettings={refetchSettings}
            onGoHome={goHome}
          />
        )}
      </main>

      {/* Sticky footer — hidden on landing + admin (admin has its own) */}
      {showChrome && (
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
      )}

      {/* Admin PIN gate */}
      <AdminGate open={gateOpen} onOpenChange={setGateOpen} onSuccess={becomeAdmin} />
    </div>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case "verification":
      return "Équipe vérification";
    case "scanner":
      return "Équipe restauration";
    default:
      return "Sonafi";
  }
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
