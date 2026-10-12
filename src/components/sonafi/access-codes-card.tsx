"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { C } from "@/lib/design-tokens";

interface AccessCodesCardProps {
  /** Called after a successful save so the parent can refresh if needed. */
  onChanged?: () => void;
}

interface Codes {
  admin: string;
  restauration: string;
  verification: string;
}

const ROLE_LABELS: { key: keyof Codes; label: string; accent: string }[] = [
  { key: "admin", label: "Code gestionnaire", accent: C.gestionnaire },
  { key: "restauration", label: "Code restauration", accent: C.restauration },
  { key: "verification", label: "Code vérification", accent: C.verification },
];

/**
 * Admin-only card that shows and edits the three access codes (one per user
 * type). Reading requires the admin code (sent as a query param); saving
 * requires it again in the body. The server re-validates on both operations.
 */
export function AccessCodesCard({ onChanged }: AccessCodesCardProps) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<Codes | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchCodes() {
    const pin = sessionStorage.getItem("sonafi.adminPin") ?? "";
    if (!pin) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/sonafi/auth/codes?code=${encodeURIComponent(pin)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { codes?: Codes };
      if (data.codes) setCodes(data.codes);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCodes();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!codes) return;
    const pin = sessionStorage.getItem("sonafi.adminPin") ?? "";
    if (!pin) {
      toast({ variant: "destructive", title: "Session expirée", description: "Redevenez admin." });
      return;
    }
    // Basic validation: no empty codes.
    if (!codes.admin.trim() || !codes.restauration.trim() || !codes.verification.trim()) {
      toast({ variant: "destructive", title: "Codes invalides", description: "Aucun code ne peut être vide." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sonafi/auth/codes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pin, codes }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (res.ok && data.success) {
        toast({ title: "Codes mis à jour", description: "Les nouveaux codes sont actifs." });
        onChanged?.();
      } else {
        toast({ variant: "destructive", title: "Échec", description: data.message ?? "Réessayez." });
      }
    } catch {
      toast({ variant: "destructive", title: "Réseau indisponible", description: "Réessayez." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-emerald-100 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${C.gestionnaire}1A`, color: C.gestionnaire }}
          >
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Codes d&apos;accès</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Un code par type d&apos;utilisateur, modifiable par le gestionnaire.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={fetchCodes}
          disabled={loading}
          aria-label="Recharger"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <form onSubmit={save} className="mt-4 space-y-3">
        {loading || !codes ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : (
          ROLE_LABELS.map(({ key, label, accent }) => (
            <div key={key} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
                aria-hidden
              />
              <label htmlFor={`code-${key}`} className="w-44 shrink-0 text-xs font-medium text-muted-foreground">
                {label}
              </label>
              <Input
                id={`code-${key}`}
                type="text"
                value={codes[key]}
                onChange={(e) => setCodes({ ...codes, [key]: e.target.value })}
                className="flex-1 font-mono"
                disabled={saving}
              />
            </div>
          ))
        )}
        <Button
          type="submit"
          size="sm"
          className="w-full gap-1.5"
          style={{ backgroundColor: C.gestionnaire }}
          disabled={saving || loading || !codes}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Enregistrer les codes
        </Button>
      </form>
    </Card>
  );
}
