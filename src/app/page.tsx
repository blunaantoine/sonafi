"use client";

import { useEffect, useRef, useState } from "react";
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

  // ---------------------------------------------------------------------
  // History layers — ONE popstate owner for the whole app.
  //
  // The phone's back button must navigate INSIDE the app instead of leaving
  // the site:
  //   · while the access gate is open → back closes the gate
  //   · while a role view is active (scanner / verification / admin) →
  //     back returns to the app home page
  //
  // Mechanics: one history entry is pushed per active layer; on state
  // change the layers are reconciled — growing pushes entries, shrinking
  // pops the entries we still own (a phone-initiated pop already consumed
  // them, detected via the missing marker in history.state), and the login
  // transition (gate closes + role becomes admin in the SAME commit)
  // REPLACES the entry label instead of back()+push(), which would race.
  // The gate and role layers are mutually exclusive: the gate can only be
  // requested from the home page.
  // ---------------------------------------------------------------------
  const layerRef = useRef<string[]>([]);
  useEffect(() => {
    const target: string[] = [];
    if (role !== "home") target.push("role");
    if (gateRole) target.push("gate");

    const prev = layerRef.current;
    // Grow: push one entry per new layer.
    for (let i = prev.length; i < target.length; i += 1) {
      window.history.pushState({ sonafiLayer: target[i] }, "");
    }
    // Shrink: pop the entries we still own.
    for (let i = prev.length - 1; i >= target.length; i -= 1) {
      if (window.history.state?.sonafiLayer === prev[i]) {
        window.history.back();
      }
    }
    // Same depth, different top layer (e.g. gate -> role on login): swap the
    // label in place — no back()/push(), hence no race.
    if (
      prev.length === target.length &&
      prev.length > 0 &&
      prev[prev.length - 1] !== target[target.length - 1]
    ) {
      window.history.replaceState(
        { sonafiLayer: target[target.length - 1] },
        "",
      );
    }
    layerRef.current = target;
  }, [role, gateRole]);

  useEffect(() => {
    const onPopState = () => {
      const top = layerRef.current[layerRef.current.length - 1];
      const current = window.history.state?.sonafiLayer as
        | string
        | undefined;
      if (top === "gate" && current !== "gate") {
        // Phone back while the gate is open → close the gate.
        setGateRole(null);
      } else if (top === "role" && current !== "role") {
        // Phone back inside a role view → return to the app home page.
        goHome();
      }
      layerRef.current = current ? [current] : [];
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goHome]);

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
