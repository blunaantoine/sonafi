"use client";

import { useState } from "react";
import { Users, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ConfigCardProps {
  /** Currently configured participant count (null while loading). */
  totalParticipants: number | null;
  /** Actual row count (may differ briefly during sync). */
  actual: number | null;
  /** Called after a successful update so the parent refetches shared state. */
  onChanged: () => void;
}

/**
 * Admin-only configuration card. Lets the admin change the number of
 * participants (badges) the system manages. The server (PIN-checked) syncs the
 * Participant table: creates missing IDs, removes unused ones beyond the count.
 * Participants with recorded scans are never deleted, so scan history is safe.
 */
export function ConfigCard({ totalParticipants, actual, onChanged }: ConfigCardProps) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      toast({
        variant: "destructive",
        title: "Nombre invalide",
        description: "Entrez un nombre entier entre 1 et 10 000.",
      });
      return;
    }
    const pin = sessionStorage.getItem("sonafi.adminPin") ?? "";
    if (!pin) {
      toast({
        variant: "destructive",
        title: "Session expirée",
        description: "Redevenez admin pour modifier.",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sonafi/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, totalParticipants: n }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        removed?: number;
        keptWithScans?: number;
      };
      if (res.ok && data.success) {
        const desc = [
          data.message,
          data.removed ? `${data.removed} supprimée(s)` : null,
          data.keptWithScans ? `${data.keptWithScans} conservée(s) avec scans` : null,
        ].filter(Boolean).join(" · ");
        toast({
          title: "Nombre mis à jour",
          description: desc,
        });
        setValue("");
        onChanged();
      } else {
        toast({
          variant: "destructive",
          title: "Échec",
          description: data.message ?? "Échec de la mise à jour.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Réseau indisponible",
        description: "Réessayez.",
      });
    } finally {
      setLoading(false);
    }
  }

  const display = totalParticipants ?? actual ?? "—";

  return (
    <Card className="border-emerald-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Users className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Nombre de participantes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalParticipants != null && actual != null && totalParticipants !== actual ? (
                <>
                  Configuré : <span className="font-medium text-emerald-700">{totalParticipants}</span>
                  {" · "}réel : {actual}
                </>
              ) : (
                <>
                  Actuellement :{" "}
                  <span className="font-medium text-emerald-700">{display}</span>{" "}
                  participantes
                </>
              )}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Changer ce nombre crée ou retire des badges (IDxxxx). Les
              participantes déjà scannées ne sont jamais supprimées.
            </p>
          </div>
        </div>

        <form onSubmit={apply} className="flex items-end gap-2">
          <div className="w-28">
            <Input
              type="number"
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
              placeholder={String(totalParticipants ?? 500)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="text-center"
              disabled={loading}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={loading || value.trim().length === 0}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Appliquer
          </Button>
        </form>
      </div>
    </Card>
  );
}
