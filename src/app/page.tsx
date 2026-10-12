"use client";

import { useState } from "react";
import { ScanTab } from "@/components/sonafi/scan-tab";
import { AdminGate } from "@/components/sonafi/admin-gate";
import { AdminDashboard } from "@/components/sonafi/admin-dashboard";
import { LandingPage } from "@/components/sonafi/landing-page";
import { VerificationView } from "@/components/sonafi/verification-view";
import { useEffectivePause } from "@/components/sonafi/use-effective-pause";
import { useSettings } from "@/components/sonafi/use-settings";
import { useRole } from "@/components/sonafi/use-role";

export default function Home() {
  const { role, becomeScanner, becomeVerification, becomeAdmin, goHome } = useRole();
  const [gateOpen, setGateOpen] = useState(false);
  const { pause, error: pauseError, refetch: refetchPause } = useEffectivePause();
  const { totalParticipants, actual, refetch: refetchSettings } = useSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
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

      {/* Admin PIN gate */}
      <AdminGate open={gateOpen} onOpenChange={setGateOpen} onSuccess={becomeAdmin} />
    </div>
  );
}

function ScannerView({ pauseError }: { pauseError: string | null }) {
  return <ScanTab />;
}
