"use client";

import { useEffect, useState } from "react";
import { ScanTab } from "@/components/sonafi/scan-tab";
import { RoleGate } from "@/components/sonafi/role-gate";
import { AdminDashboard } from "@/components/sonafi/admin-dashboard";
import { LandingPage } from "@/components/sonafi/landing-page";
import { VerificationView } from "@/components/sonafi/verification-view";
import { useEffectivePause } from "@/components/sonafi/use-effective-pause";
import { useSettings } from "@/components/sonafi/use-settings";
import { LS_KEY, useRole } from "@/components/sonafi/use-role";
import type { AccessCodeRole } from "@/lib/access-codes";

export default function Home() {
  const { role, becomeScanner, becomeVerification, becomeAdmin, goHome } = useRole();
  /** Which role the open gate is asking the code for. */
  const [gateRole, setGateRole] = useState<AccessCodeRole | null>(null);
  const { pause, error: pauseError, refetch: refetchPause } = useEffectivePause();
  const { totalParticipants, actual, refetch: refetchSettings } = useSettings();

  function requestRole(r: AccessCodeRole) {
    setGateRole(r);
  }

  // ---------------------------------------------------------------------
  // Discreet gestionnaire access. The "Gestionnaire" card is hidden on the
  // landing page (see SHOW_GESTIONNAIRE_CARD in landing-page.tsx); the gate
  // opens either via
  //   /?gestionnaire   or   /#gestionnaire
  // or by tapping the word "aux" in the landing footer sentence
  // "Accès réservé aux équipes du sommet" (invisible button — see the
  // footer in landing-page.tsx). The secret key is wiped from the URL
  // immediately, and the gate never reopens over an already-active manager
  // session (role "admin" in localStorage). The PIN is always required.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const isGestionnaireAccess =
      new URLSearchParams(window.location.search).has("gestionnaire") ||
      window.location.hash === "#gestionnaire";
    if (!isGestionnaireAccess) return;

    window.history.replaceState(null, "", window.location.pathname);

    try {
      if (window.localStorage.getItem(LS_KEY) === "admin") return;
    } catch {
      /* ignore */
    }
    setGateRole("admin");
  }, []);

  function onGateSuccess(_code: string) {
    // The code was verified server-side for gateRole — switch to that role.
    if (gateRole === "admin") becomeAdmin();
    else if (gateRole === "restauration") becomeScanner();
    else if (gateRole === "verification") becomeVerification();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        {role === "home" ? (
          <LandingPage
            onSelectScanner={() => requestRole("restauration")}
            onSelectVerification={() => requestRole("verification")}
            onSelectAdmin={() => requestRole("admin")}
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

      {/* Role access-code gate (one dialog, role passed dynamically) */}
      {gateRole && (
        <RoleGate
          role={gateRole}
          open={gateRole !== null}
          onOpenChange={(o) => {
            if (!o) setGateRole(null);
          }}
          onSuccess={onGateSuccess}
        />
      )}
    </div>
  );
}

function ScannerView({ pauseError }: { pauseError: string | null }) {
  return <ScanTab />;
}
