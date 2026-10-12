"use client";

import { useState } from "react";
import { Clock, Coffee, Utensils, ShieldAlert, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PAUSE_META,
  PAUSE_WINDOWS,
  formatTimestamp,
  type EffectivePause,
  type PauseType,
} from "@/lib/sonafi";
import { cn } from "@/lib/utils";

interface PauseOverrideBarProps {
  /** The effective pause (auto + any active override). */
  pause: EffectivePause | null;
  /** Called after a successful set/clear so the parent can refetch. */
  onChanged: () => void;
}

/**
 * Admin-only control bar. Shows the current effective pause (auto vs forced)
 * and lets the admin force café / déjeuner or return to automatic mode. The
 * PIN is checked server-side inside POST /api/sonafi/pause/override, so the
 * admin role in localStorage alone is not enough to perform the action.
 *
 * This is the "retard" escape hatch: if the café pause runs past 11h, the admin
 * forces café here until it's really over, then restores auto (or forces
 * déjeuner). Every scanner phone picks the change up on its next poll.
 */
export function PauseOverrideBar({ pause, onChanged }: PauseOverrideBarProps) {
  const [loading, setLoading] = useState<PauseType | "auto" | null>(null);

  async function apply(pauseType: PauseType | null) {
    // The PIN is read from the admin's session — we reuse the value the gate
    // verified. For simplicity (and since the server re-checks), we send a
    // PIN the admin re-confirms. But to avoid a second prompt, we rely on the
    // shared session PIN stored briefly below.
    const pin = sessionStorage.getItem("sonafi.adminPin") ?? "";
    if (!pin) {
      // Should not happen — admin can't reach here without the gate.
      return;
    }
    setLoading(pauseType ?? "auto");
    try {
      await fetch("/api/sonafi/pause/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, pauseType }),
      });
      onChanged();
    } finally {
      setLoading(null);
    }
  }

  const active = pause?.pauseType;
  const isOverride = pause?.source === "override";

  return (
    <Card className="border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl text-lg shadow-sm",
              active === "dejeuner"
                ? "bg-orange-100 text-orange-700"
                : "bg-amber-100 text-amber-700",
            )}
          >
            {active === "dejeuner" ? (
              <Utensils className="h-5 w-5" />
            ) : (
              <Coffee className="h-5 w-5" />
            )}
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                Pause active :{" "}
                {active ? PAUSE_META[active].label : "—"}
              </span>
              {isOverride && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                  <ShieldAlert className="h-3 w-3" />
                  Forcée
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isOverride ? (
                <>
                  Forcée par l'admin · depuis{" "}
                  {pause?.setAt ? formatTimestamp(pause.setAt) : "—"}
                </>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Automatique · {active ? PAUSE_WINDOWS[active] : ""}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={active === "cafe" && !isOverride ? "default" : "outline"}
            className={cn(
              "gap-1.5",
              active === "cafe" && !isOverride
                ? "bg-amber-500 hover:bg-amber-600"
                : "",
            )}
            disabled={loading !== null}
            onClick={() => apply("cafe")}
          >
            {loading === "cafe" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Coffee className="h-4 w-4" />
            )}
            Forcer café
          </Button>
          <Button
            type="button"
            size="sm"
            variant={active === "dejeuner" && !isOverride ? "default" : "outline"}
            className={cn(
              "gap-1.5",
              active === "dejeuner" && !isOverride
                ? "bg-orange-500 hover:bg-orange-600"
                : "",
            )}
            disabled={loading !== null}
            onClick={() => apply("dejeuner")}
          >
            {loading === "dejeuner" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Utensils className="h-4 w-4" />
            )}
            Forcer déjeuner
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!isOverride || loading !== null}
            onClick={() => apply(null)}
          >
            {loading === "auto" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Auto
          </Button>
        </div>
      </div>
    </Card>
  );
}
