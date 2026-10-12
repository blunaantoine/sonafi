"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the PIN is verified server-side. */
  onSuccess: () => void;
}

/**
 * PIN dialog that grants admin mode. Calls /api/sonafi/auth/verify; only on a
 * 200 response does the client switch to admin role. The verified PIN is also
 * stashed in sessionStorage so the override bar can pass it to the privileged
 * POST /api/sonafi/pause/override (which re-checks it server-side). The role in
 * localStorage alone cannot force a pause — the server always re-validates.
 */
export function AdminGate({ open, onOpenChange, onSuccess }: AdminGateProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setPin("");
      setError(null);
      setLoading(false);
      // Focus the PIN field after the dialog animates in.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sonafi/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean };
      if (res.ok && data.valid) {
        // Stash the verified PIN for this session so the override bar can use
        // it without re-prompting. The server re-checks it on every privileged
        // action, so a stale/guessed value here is harmless.
        try {
          sessionStorage.setItem("sonafi.adminPin", pin.trim());
        } catch {
          /* ignore */
        }
        onSuccess();
        onOpenChange(false);
      } else {
        setError("Code administrateur incorrect.");
      }
    } catch {
      setError("Vérification impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Espace administrateur</DialogTitle>
          <DialogDescription className="text-center">
            Saisissez le code administrateur pour accéder à la gestion des
            pauses, badges et statistiques.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Code administrateur"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="pl-9 text-center tracking-widest"
              disabled={loading}
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-rose-600">
              <X className="h-4 w-4" />
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={loading || pin.trim().length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Vérification…
              </>
            ) : (
              "Accéder"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
